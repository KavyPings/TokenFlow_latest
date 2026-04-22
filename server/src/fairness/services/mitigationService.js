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

  // ── Build deterministic mitigation plan + apply ─────────
  const mitigationPlan = buildMitigationPlan(rows, config);
  const { adjustedRows, impactedCases } = applyMitigationToRows(rows, config, mitigationPlan);

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
    config: mitigationPlan,
    before_summary: summarizeMetrics(beforeMetrics),
    after_summary: summarizeMetrics(afterMetrics),
    deltas,
    impacted_count: impactedCases.length,
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
    impactedCases.length
  );

  // ── Persist impacted cases ─────────────────────────────
  if (impactedCases.length > 0) {
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

    insertCases(impactedCases);
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
  const scores = groupRows
    .map((r) => Number(r.score))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => b - a);

  if (scores.length === 0) return 0.5;

  const desiredSelected = Math.max(0, Math.min(scores.length, Math.round(targetSelectionRate * scores.length)));
  if (desiredSelected === 0) return scores[0] + 1e-9;
  if (desiredSelected >= scores.length) return scores[scores.length - 1] - 1e-9;

  const lower = scores[desiredSelected];
  const upper = scores[desiredSelected - 1];
  return round((upper + lower) / 2, 6);
}

export function applyMitigationToRows(rows, config, mitigationConfig) {
  if (mitigationConfig?.strategy === 'target_rate_rebalancing') {
    const plan = buildMitigationPlan(rows, config, mitigationConfig.group_targets || null);
    return {
      adjustedRows: plan.adjustedRows,
      impactedCases: plan.impactedCases,
    };
  }

  const groupThresholds = mitigationConfig?.group_thresholds || mitigationConfig || {};
  const mappings = config.column_mappings || {};
  const scoreCol = mappings.predicted_score;
  const predictedCol = mappings.predicted_outcome;
  const recordIdCol = mappings.record_id;
  const protectedAttrs = config.protected_attributes || [];
  const impactedCases = [];

  const adjustedRows = rows.map((row) => {
    const adjusted = { ...row };
    const originalPred = toBinary(row[predictedCol]);
    let adjustedPred = originalPred;
    let lastApplied = null;

    for (const attr of protectedAttrs) {
      const grp = String(row[attr.column] ?? '__null__');
      const threshInfo = groupThresholds[attr.column]?.[grp];
      if (!threshInfo?.adjusted) continue;

      const rawScore = scoreCol ? Number(row[scoreCol]) : NaN;
      const effectiveScore = Number.isFinite(rawScore) ? rawScore : originalPred;
      adjustedPred = effectiveScore >= threshInfo.threshold ? 1 : 0;
      lastApplied = {
        groupName: grp,
        attribute: attr.column,
        originalScore: effectiveScore,
        adjustedThreshold: threshInfo.threshold,
      };
    }

    adjusted[predictedCol] = adjustedPred;

    if (lastApplied && adjustedPred !== originalPred) {
      impactedCases.push({
        recordId: row[recordIdCol],
        originalPred,
        adjustedPred,
        groupName: lastApplied.groupName,
        attribute: lastApplied.attribute,
        triggerMetric: 'statistical_parity_difference',
        originalScore: lastApplied.originalScore,
        adjustedThreshold: lastApplied.adjustedThreshold,
      });
    }

    return adjusted;
  });

  return { adjustedRows, impactedCases };
}

function buildMitigationPlan(rows, config, presetGroupTargets = null) {
  const mappings = config.column_mappings || {};
  const scoreCol = mappings.predicted_score;
  const predictedCol = mappings.predicted_outcome;
  const targetCol = mappings.target_outcome;
  const recordIdCol = mappings.record_id;
  const protectedAttrs = config.protected_attributes || [];

  const originalPred = rows.map((row) => toBinary(row[predictedCol]));
  const workingPred = [...originalPred];

  const groupThresholds = {};
  const groupTargets = {};

  for (const attr of protectedAttrs) {
    const column = attr.column;
    const referenceGroup = String(attr.reference_group);
    groupThresholds[column] = {};
    groupTargets[column] = {};

    const indicesByGroup = new Map();
    for (let i = 0; i < rows.length; i++) {
      const grp = String(rows[i][column] ?? '__null__');
      if (!indicesByGroup.has(grp)) indicesByGroup.set(grp, []);
      indicesByGroup.get(grp).push(i);
    }

    const refIndices = indicesByGroup.get(referenceGroup) || [];
    const refPositives = refIndices.filter((idx) => workingPred[idx] === 1).length;
    const refRate = safeDiv(refPositives, refIndices.length) ?? 0;
    groupTargets[column][referenceGroup] = round(refRate, 6);

    for (const [grp, groupIndices] of indicesByGroup.entries()) {
      if (grp === referenceGroup) {
        groupThresholds[column][grp] = { threshold: 0.5, adjusted: false };
        continue;
      }

      const currentPositives = groupIndices.filter((idx) => workingPred[idx] === 1).length;
      const targetRate = presetGroupTargets?.[column]?.[grp] ?? refRate;
      const desiredPositives = Math.max(0, Math.min(groupIndices.length, Math.round(targetRate * groupIndices.length)));
      const needed = desiredPositives - currentPositives;

      groupTargets[column][grp] = round(targetRate, 6);

      const scoredRows = groupIndices.map((idx) => {
        const rawScore = scoreCol ? Number(rows[idx][scoreCol]) : NaN;
        const score = Number.isFinite(rawScore) ? rawScore : originalPred[idx];
        return {
          idx,
          score,
          actual: toBinary(rows[idx][targetCol]),
          recordId: String(rows[idx][recordIdCol] ?? idx),
        };
      });

      const optimalThreshold = findOptimalThreshold(
        scoredRows.map((r) => ({ score: r.score })),
        targetRate
      );
      groupThresholds[column][grp] = { threshold: optimalThreshold, adjusted: true };

      if (needed > 0) {
        const candidates = scoredRows
          .filter((r) => workingPred[r.idx] === 0)
          .sort((a, b) => (b.score - a.score) || (b.actual - a.actual) || a.recordId.localeCompare(b.recordId));
        for (const c of candidates.slice(0, needed)) {
          workingPred[c.idx] = 1;
        }
      } else if (needed < 0) {
        const candidates = scoredRows
          .filter((r) => workingPred[r.idx] === 1)
          .sort((a, b) => (a.score - b.score) || (a.actual - b.actual) || a.recordId.localeCompare(b.recordId));
        for (const c of candidates.slice(0, Math.abs(needed))) {
          workingPred[c.idx] = 0;
        }
      }
    }
  }

  const impactedCases = [];
  const adjustedRows = rows.map((row, idx) => {
    const adjusted = { ...row };
    adjusted[predictedCol] = workingPred[idx];
    if (workingPred[idx] !== originalPred[idx]) {
      const attr = protectedAttrs[0];
      impactedCases.push({
        recordId: row[recordIdCol],
        originalPred: originalPred[idx],
        adjustedPred: workingPred[idx],
        groupName: attr ? String(row[attr.column] ?? '__null__') : 'n/a',
        attribute: attr?.column || 'n/a',
        triggerMetric: 'statistical_parity_difference',
        originalScore: scoreCol && Number.isFinite(Number(row[scoreCol])) ? Number(row[scoreCol]) : originalPred[idx],
        adjustedThreshold: groupThresholds[attr?.column || '']?.[String(row[attr?.column] ?? '__null__')]?.threshold ?? 0.5,
      });
    }
    return adjusted;
  });

  return {
    strategy: 'target_rate_rebalancing',
    group_thresholds: groupThresholds,
    group_targets: groupTargets,
    adjustedRows,
    impactedCases,
  };
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
