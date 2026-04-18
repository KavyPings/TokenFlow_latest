// ═══════════════════════════════════════════════════════════
// Mitigation Service — Threshold adjustment for bias reduction.
//
// Uses fixed-bin score buckets (B=100) for approximate threshold
// sweep: O(n + B×G) complexity per group.
//
// Requires predicted_score column to operate.
// ═══════════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import { round, safeDiv } from '../utils/mathHelpers.js';
import { computeAllMetrics, toBinary } from './fairnessMetrics.js';

/** Number of bins for threshold sweep */
const NUM_BINS = 100;

/**
 * Run mitigation on a dataset using threshold adjustment.
 * Finds per-group optimal thresholds that maximize fairness
 * while preserving accuracy.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} datasetId
 * @param {string} reportId - The report that triggered mitigation
 * @param {object[]} rows - Dataset rows
 * @param {object} config - User config (must have predicted_score in column_mappings)
 * @returns {object} - Mitigation report
 */
export function runMitigation(db, datasetId, reportId, rows, config) {
  const mappings = config.column_mappings;
  const scoreCol = mappings.predicted_score;
  const targetCol = mappings.target_outcome;
  const predictedCol = mappings.predicted_outcome;
  const recordIdCol = mappings.record_id;

  if (!scoreCol) {
    throw new Error('Mitigation requires a predicted_score column. Add predicted_score to column_mappings.');
  }

  const mitigationId = uuidv4();
  const protectedAttrs = config.protected_attributes || [];

  // ── Before metrics ──────────────────────────────────────
  const beforeMetrics = computeAllMetrics(rows, config);

  // ── Compute per-group optimal thresholds ───────────────
  const groupThresholds = {};
  const allImpactedCases = [];

  for (const attr of protectedAttrs) {
    const { column, reference_group } = attr;
    groupThresholds[column] = {};

    // Partition rows by group, collect scores
    const groupBuckets = new Map();
    for (const row of rows) {
      const grp = String(row[column] ?? '__null__');
      if (!groupBuckets.has(grp)) groupBuckets.set(grp, []);
      groupBuckets.get(grp).push({
        recordId: row[recordIdCol],
        score: Number(row[scoreCol]),
        actual: toBinary(row[targetCol]),
        originalPred: toBinary(row[predictedCol]),
      });
    }

    // Get reference group's selection rate (their threshold defines the target)
    const refRows = groupBuckets.get(String(reference_group)) || [];
    const refSelectionRate = safeDiv(
      refRows.filter(r => r.originalPred === 1).length,
      refRows.length
    );

    // For each non-reference group, find threshold that matches ref selection rate
    for (const [grp, grpRows] of groupBuckets) {
      if (grp === String(reference_group)) {
        groupThresholds[column][grp] = { threshold: 0.5, adjusted: false };
        continue;
      }

      const optimalThreshold = findOptimalThreshold(grpRows, refSelectionRate);
      groupThresholds[column][grp] = { threshold: optimalThreshold, adjusted: true };

      // Collect impacted cases: rows where new prediction differs from original
      for (const r of grpRows) {
        if (!Number.isFinite(r.score)) continue;
        const newPred = r.score >= optimalThreshold ? 1 : 0;
        if (newPred !== r.originalPred) {
          allImpactedCases.push({
            recordId: r.recordId,
            originalPred: r.originalPred,
            adjustedPred: newPred,
            groupName: grp,
            attribute: column,
            triggerMetric: 'statistical_parity_difference',
            originalScore: r.score,
            adjustedThreshold: optimalThreshold,
          });
        }
      }
    }
  }

  // ── Apply adjusted predictions and recompute ───────────
  const adjustedRows = rows.map(row => {
    const adjusted = { ...row };
    for (const attr of protectedAttrs) {
      const grp = String(row[attr.column] ?? '__null__');
      const threshInfo = groupThresholds[attr.column]?.[grp];
      if (threshInfo?.adjusted) {
        const score = Number(row[scoreCol]);
        if (Number.isFinite(score)) {
          adjusted[predictedCol] = score >= threshInfo.threshold ? 1 : 0;
        }
      }
    }
    return adjusted;
  });

  // ── After metrics ──────────────────────────────────────
  const afterMetrics = computeAllMetrics(adjustedRows, config);

  // ── Compute deltas ─────────────────────────────────────
  const deltas = computeDeltas(beforeMetrics, afterMetrics, config);

  // ── Persist mitigation report ──────────────────────────
  const mitigationReport = {
    id: mitigationId,
    dataset_id: datasetId,
    report_id: reportId,
    method: 'threshold_adjustment',
    config: { num_bins: NUM_BINS, group_thresholds: groupThresholds },
    before_summary: summarizeMetrics(beforeMetrics),
    after_summary: summarizeMetrics(afterMetrics),
    deltas,
    impacted_count: allImpactedCases.length,
    created_at: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO fairness_mitigation_reports
      (id, dataset_id, report_id, method, config, before_metrics, after_metrics, deltas, impacted_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    mitigationId, datasetId, reportId,
    'threshold_adjustment',
    JSON.stringify(mitigationReport.config),
    JSON.stringify(mitigationReport.before_summary),
    JSON.stringify(mitigationReport.after_summary),
    JSON.stringify(deltas),
    allImpactedCases.length
  );

  // ── Persist impacted cases ─────────────────────────────
  if (allImpactedCases.length > 0) {
    const stmt = db.prepare(`
      INSERT INTO fairness_impacted_cases
        (id, dataset_id, mitigation_id, record_id, original_pred, adjusted_pred, group_name, attribute, trigger_metric, original_score, adjusted_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCases = db.transaction((cases) => {
      for (const c of cases) {
        stmt.run(
          uuidv4(), datasetId, mitigationId,
          String(c.recordId), c.originalPred, c.adjustedPred,
          c.groupName, c.attribute, c.triggerMetric,
          c.originalScore, c.adjustedThreshold
        );
      }
    });

    insertCases(allImpactedCases);
  }

  return mitigationReport;
}

/**
 * Find optimal threshold for a group using fixed-bin sweep.
 * Target: match a desired selection rate.
 * Complexity: O(n + B) where B=NUM_BINS.
 *
 * @param {{ score: number, actual: number }[]} groupRows
 * @param {number} targetSelectionRate
 * @returns {number}
 */
function findOptimalThreshold(groupRows, targetSelectionRate) {
  if (groupRows.length === 0 || targetSelectionRate === null) return 0.5;

  // Build histogram of scores into fixed bins
  const bins = new Array(NUM_BINS + 1).fill(0);
  let validCount = 0;

  for (const r of groupRows) {
    if (!Number.isFinite(r.score)) continue;
    const clampedScore = Math.max(0, Math.min(1, r.score));
    const binIdx = Math.min(Math.floor(clampedScore * NUM_BINS), NUM_BINS);
    bins[binIdx]++;
    validCount++;
  }

  if (validCount === 0) return 0.5;

  // Sweep from high threshold to low — find where selection rate ≈ target
  let selected = 0;
  let bestThreshold = 0.5;
  let bestDiff = Infinity;

  for (let i = NUM_BINS; i >= 0; i--) {
    selected += bins[i];
    const rate = safeDiv(selected, validCount);
    if (rate === null) continue;

    const diff = Math.abs(rate - targetSelectionRate);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestThreshold = i / NUM_BINS;
    }
  }

  return round(bestThreshold, 4);
}

/**
 * Compute deltas between before and after metrics.
 */
function computeDeltas(before, after, config) {
  const deltas = { per_attribute: {} };

  for (const attr of config.protected_attributes || []) {
    const col = attr.column;
    const beforeAttr = before.per_attribute?.[col] || {};
    const afterAttr = after.per_attribute?.[col] || {};
    const attrDeltas = { groups: {}, fairness: {} };

    // Group-level accuracy deltas
    for (const grp of Object.keys(beforeAttr.groups || {})) {
      const bg = beforeAttr.groups[grp] || {};
      const ag = (afterAttr.groups || {})[grp] || {};
      const beforeAcc = safeDiv((bg.confusion_matrix?.true_positives || 0) + (bg.confusion_matrix?.true_negatives || 0), bg.count || 1);
      const afterAcc = safeDiv((ag.confusion_matrix?.true_positives || 0) + (ag.confusion_matrix?.true_negatives || 0), ag.count || 1);
      attrDeltas.groups[grp] = {
        selection_rate_delta: round((ag.selection_rate || 0) - (bg.selection_rate || 0)),
        accuracy_delta: round((afterAcc || 0) - (beforeAcc || 0)),
      };
    }

    // Fairness metric deltas
    const beforeFair = beforeAttr.fairness_metrics || {};
    const afterFair = afterAttr.fairness_metrics || {};
    if (!beforeFair.error && !afterFair.error) {
      for (const grp of Object.keys(beforeFair)) {
        const bf = beforeFair[grp] || {};
        const af = afterFair[grp] || {};
        attrDeltas.fairness[grp] = {
          spd_delta: round((af.statistical_parity_difference || 0) - (bf.statistical_parity_difference || 0)),
          dir_delta: round((af.disparate_impact_ratio || 0) - (bf.disparate_impact_ratio || 0)),
          eod_delta: round((af.equal_opportunity_difference || 0) - (bf.equal_opportunity_difference || 0)),
          aod_delta: round((af.average_odds_difference || 0) - (bf.average_odds_difference || 0)),
        };
      }
    }

    deltas.per_attribute[col] = attrDeltas;
  }

  return deltas;
}

/**
 * Summarize metrics for comparison (extract key numbers only).
 */
function summarizeMetrics(metrics) {
  const summary = {};
  for (const [attr, attrData] of Object.entries(metrics.per_attribute || {})) {
    summary[attr] = {
      groups: {},
      fairness: attrData.fairness_metrics || {},
    };
    for (const [grp, gd] of Object.entries(attrData.groups || {})) {
      summary[attr].groups[grp] = {
        count: gd.count,
        selection_rate: gd.selection_rate,
        tpr: gd.true_positive_rate,
        fpr: gd.false_positive_rate,
        confusion_matrix: gd.confusion_matrix,
      };
    }
  }
  return summary;
}

/**
 * Get the latest mitigation report for a dataset.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} datasetId
 * @returns {object|null}
 */
export function getLatestMitigationReport(db, datasetId) {
  const row = db.prepare(`
    SELECT * FROM fairness_mitigation_reports
    WHERE dataset_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(datasetId);

  if (!row) return null;

  return {
    ...row,
    config: safeJsonParse(row.config),
    before_metrics: safeJsonParse(row.before_metrics),
    after_metrics: safeJsonParse(row.after_metrics),
    deltas: safeJsonParse(row.deltas),
  };
}

/**
 * Get impacted cases for a dataset.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} datasetId
 * @param {object} [opts={}]
 * @param {number} [opts.limit=100]
 * @param {number} [opts.offset=0]
 * @returns {{ cases: object[], total: number }}
 */
export function getImpactedCases(db, datasetId, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit) || 100, 1), 500);
  const offset = Math.max(parseInt(opts.offset) || 0, 0);

  const total = db.prepare('SELECT COUNT(*) as c FROM fairness_impacted_cases WHERE dataset_id = ?').get(datasetId).c;
  const cases = db.prepare(`
    SELECT * FROM fairness_impacted_cases
    WHERE dataset_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(datasetId, limit, offset);

  return { cases, total, limit, offset };
}

function safeJsonParse(str) {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}
