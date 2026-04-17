// ═══════════════════════════════════════════════════════════
// Audit Service — Audit trail, report generation, review
// queue management for the fairness auditing system.
//
// Provides immutable logging, structured report generation
// with risk assessment, and violation tracking.
// ═══════════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import { round } from '../utils/mathHelpers.js';
import { getDefaultThresholds } from '../utils/validation.js';

// ───────────────────────────────────────────────────────────
// AUDIT TRAIL (append-only, immutable)
// ───────────────────────────────────────────────────────────

/**
 * Log an audit event. This is append-only — never update or delete.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} params
 * @param {string} params.datasetId
 * @param {string} params.action - e.g. 'upload', 'profile', 'analyze', 'report', 'review_update'
 * @param {object} [params.details={}] - Action-specific details
 * @param {object} [params.config=null] - Config snapshot at time of action
 * @param {object} [params.metrics=null] - Metrics snapshot at time of action
 * @param {string} [params.actor='system'] - User or system identifier
 */
export function logAuditEvent(db, { datasetId, action, details = {}, config = null, metrics = null, actor = 'system' }) {
  const stmt = db.prepare(`
    INSERT INTO fairness_audit_logs (dataset_id, action, details, config_snapshot, metrics_snapshot, actor)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    datasetId,
    action,
    JSON.stringify(details),
    config ? JSON.stringify(config) : null,
    metrics ? JSON.stringify(metrics) : null,
    actor
  );
}

/**
 * Retrieve the full audit trail for a dataset.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} datasetId
 * @returns {object[]}
 */
export function getAuditTrail(db, datasetId) {
  const stmt = db.prepare(`
    SELECT id, dataset_id, action, details, config_snapshot, metrics_snapshot, actor, timestamp
    FROM fairness_audit_logs
    WHERE dataset_id = ?
    ORDER BY timestamp ASC, id ASC
  `);

  return stmt.all(datasetId).map((row) => ({
    ...row,
    details: safeJsonParse(row.details, {}),
    config_snapshot: safeJsonParse(row.config_snapshot, null),
    metrics_snapshot: safeJsonParse(row.metrics_snapshot, null),
  }));
}

// ───────────────────────────────────────────────────────────
// REPORT GENERATION
// ───────────────────────────────────────────────────────────

/**
 * Generate a structured fairness report from computed metrics.
 * Evaluates thresholds, flags violations, and assigns a risk level.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} datasetId
 * @param {object} profile - Dataset profile from datasetProfiler
 * @param {object} metrics - Computed metrics from fairnessMetrics
 * @param {object} config - User config
 * @returns {object} - The created report
 */
export function generateReport(db, datasetId, profile, metrics, config) {
  const reportId = uuidv4();
  const thresholds = { ...getDefaultThresholds(), ...(config.thresholds || {}) };

  // Collect all violations across all protected attributes
  const allViolations = [];

  for (const [attrName, attrData] of Object.entries(metrics.per_attribute || {})) {
    const fairnessMetrics = attrData.fairness_metrics || {};

    // Skip if there was an error (e.g. reference group not found)
    if (fairnessMetrics.error) {
      allViolations.push({
        attribute: attrName,
        group: '__all__',
        metric: 'reference_group_error',
        value: null,
        threshold: null,
        severity: 'high',
        message: fairnessMetrics.error,
      });
      continue;
    }

    for (const [groupName, groupFairness] of Object.entries(fairnessMetrics)) {
      // Statistical Parity Difference
      checkThreshold(allViolations, {
        attribute: attrName,
        group: groupName,
        metric: 'statistical_parity_difference',
        value: groupFairness.statistical_parity_difference,
        threshold: thresholds.statistical_parity_difference,
        check: 'abs_exceeds',
      });

      // Disparate Impact Ratio
      checkDisparateImpact(allViolations, {
        attribute: attrName,
        group: groupName,
        value: groupFairness.disparate_impact_ratio,
        min: thresholds.disparate_impact_ratio_min,
        max: thresholds.disparate_impact_ratio_max,
      });

      // Equal Opportunity Difference
      checkThreshold(allViolations, {
        attribute: attrName,
        group: groupName,
        metric: 'equal_opportunity_difference',
        value: groupFairness.equal_opportunity_difference,
        threshold: thresholds.equal_opportunity_difference,
        check: 'abs_exceeds',
      });

      // Average Odds Difference
      checkThreshold(allViolations, {
        attribute: attrName,
        group: groupName,
        metric: 'average_odds_difference',
        value: groupFairness.average_odds_difference,
        threshold: thresholds.average_odds_difference,
        check: 'abs_exceeds',
      });
    }
  }

  // Determine risk level
  const riskLevel = computeRiskLevel(allViolations);

  // Build report structure
  const report = {
    report_id: reportId,
    dataset_id: datasetId,
    generated_at: new Date().toISOString(),
    dataset_summary: {
      name: config.dataset_name,
      total_records: profile.total_rows,
      total_columns: profile.total_columns,
      protected_attributes: (config.protected_attributes || []).map((a) => a.column),
      target_column: config.column_mappings.target_outcome,
      predicted_column: config.column_mappings.predicted_outcome,
    },
    thresholds_used: thresholds,
    per_group_metrics: metrics.per_attribute,
    violations: allViolations,
    violation_count: allViolations.length,
    risk_level: riskLevel,
    summary: generateSummaryText(riskLevel, allViolations, config),
  };

  // Persist report to database
  const stmt = db.prepare(`
    INSERT INTO fairness_reports (id, dataset_id, report, risk_level, violation_count)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(reportId, datasetId, JSON.stringify(report), riskLevel, allViolations.length);

  // Add violations to review queue
  if (allViolations.length > 0) {
    addToReviewQueue(db, datasetId, reportId, allViolations);
  }

  return report;
}

/**
 * Get the latest report for a dataset.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} datasetId
 * @returns {object|null}
 */
export function getLatestReport(db, datasetId) {
  const stmt = db.prepare(`
    SELECT id, dataset_id, report, risk_level, violation_count, created_at
    FROM fairness_reports
    WHERE dataset_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const row = stmt.get(datasetId);
  if (!row) return null;

  return {
    ...row,
    report: safeJsonParse(row.report, {}),
  };
}

// ───────────────────────────────────────────────────────────
// REVIEW QUEUE
// ───────────────────────────────────────────────────────────

/**
 * Add flagged violations to the review queue.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} datasetId
 * @param {string} reportId
 * @param {object[]} violations
 */
export function addToReviewQueue(db, datasetId, reportId, violations) {
  const stmt = db.prepare(`
    INSERT INTO fairness_review_queue
      (id, dataset_id, report_id, metric_name, group_name, attribute, expected_range, actual_value, severity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const v of items) {
      if (v.value === null) continue; // skip null-valued violations
      stmt.run(
        uuidv4(),
        datasetId,
        reportId,
        v.metric,
        v.group,
        v.attribute,
        v.threshold_range || `threshold: ${v.threshold}`,
        v.value,
        v.severity
      );
    }
  });

  insertMany(violations);
}

/**
 * Get review queue items with optional filters and pagination.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} [filters={}]
 * @param {string} [filters.dataset_id]
 * @param {string} [filters.status] - 'open', 'acknowledged', 'resolved', 'dismissed'
 * @param {string} [filters.severity] - 'low', 'medium', 'high'
 * @param {number} [filters.limit=50]
 * @param {number} [filters.offset=0]
 * @returns {{ items: object[], total: number }}
 */
export function getReviewQueue(db, filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.dataset_id) {
    conditions.push('dataset_id = ?');
    params.push(filters.dataset_id);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.severity) {
    conditions.push('severity = ?');
    params.push(filters.severity);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(parseInt(filters.limit) || 50, 1), 200);
  const offset = Math.max(parseInt(filters.offset) || 0, 0);

  // Get total count
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM fairness_review_queue ${where}`);
  const { total } = countStmt.get(...params);

  // Get paginated items
  const listStmt = db.prepare(`
    SELECT * FROM fairness_review_queue
    ${where}
    ORDER BY
      CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
      created_at DESC
    LIMIT ? OFFSET ?
  `);
  const items = listStmt.all(...params, limit, offset);

  return { items, total, limit, offset };
}

/**
 * Update a review queue item's status.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} itemId
 * @param {object} update
 * @param {string} update.status
 * @param {string} [update.reviewer]
 * @param {string} [update.review_notes]
 * @returns {object|null}
 */
export function updateReviewItem(db, itemId, update) {
  const validStatuses = ['open', 'acknowledged', 'resolved', 'dismissed'];
  if (!validStatuses.includes(update.status)) {
    throw new Error(`Invalid status "${update.status}". Must be one of: ${validStatuses.join(', ')}`);
  }

  const stmt = db.prepare(`
    UPDATE fairness_review_queue
    SET status = ?, reviewer = ?, review_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const result = stmt.run(
    update.status,
    update.reviewer || null,
    update.review_notes || null,
    itemId
  );

  if (result.changes === 0) return null;

  return db.prepare('SELECT * FROM fairness_review_queue WHERE id = ?').get(itemId);
}

// ───────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ───────────────────────────────────────────────────────────

/**
 * Check if a metric value exceeds a symmetric threshold.
 * Adds a violation object if |value| > threshold.
 */
function checkThreshold(violations, { attribute, group, metric, value, threshold, check }) {
  if (value === null || threshold === null || threshold === undefined) return;

  let violated = false;
  let severity = 'low';

  if (check === 'abs_exceeds') {
    const absValue = Math.abs(value);
    if (absValue > threshold) {
      violated = true;
      severity = absValue > threshold * 2 ? 'high' : 'medium';
    }
  }

  if (violated) {
    violations.push({
      attribute,
      group,
      metric,
      value: round(value),
      threshold,
      threshold_range: `[-${threshold}, +${threshold}]`,
      severity,
      message: `${metric} of ${round(value)} for group "${group}" exceeds threshold ±${threshold}`,
    });
  }
}

/**
 * Check disparate impact ratio against the four-fifths rule.
 */
function checkDisparateImpact(violations, { attribute, group, value, min, max }) {
  if (value === null) return;

  if (value < min || value > max) {
    const severity = value < 0.6 || value > 1.67 ? 'high' : 'medium';
    violations.push({
      attribute,
      group,
      metric: 'disparate_impact_ratio',
      value: round(value),
      threshold: null,
      threshold_range: `[${min}, ${max}]`,
      severity,
      message: `Disparate impact ratio of ${round(value)} for group "${group}" is outside fair range [${min}, ${max}]`,
    });
  }
}

/**
 * Compute overall risk level from violations.
 *
 * HIGH: any high-severity violation or disparate impact < 0.8
 * MEDIUM: any medium-severity violation
 * LOW: no violations or only low-severity
 */
function computeRiskLevel(violations) {
  if (violations.some((v) => v.severity === 'high')) return 'high';
  if (violations.some((v) => v.severity === 'medium')) return 'medium';
  return 'low';
}

/**
 * Generate a human-readable summary of the report.
 */
function generateSummaryText(riskLevel, violations, config) {
  const attrs = (config.protected_attributes || []).map((a) => a.column);
  const highCount = violations.filter((v) => v.severity === 'high').length;
  const medCount = violations.filter((v) => v.severity === 'medium').length;

  if (riskLevel === 'low') {
    return `Fairness analysis complete. No significant bias detected across protected attributes [${attrs.join(', ')}]. All metrics are within configured thresholds.`;
  }

  if (riskLevel === 'high') {
    return `⚠️ HIGH RISK: Significant fairness violations detected. ${highCount} high-severity and ${medCount} medium-severity issues found across protected attributes [${attrs.join(', ')}]. Immediate review recommended.`;
  }

  return `⚡ MEDIUM RISK: Some fairness concerns detected. ${medCount} medium-severity issues found across protected attributes [${attrs.join(', ')}]. Review recommended before deployment.`;
}

/**
 * Safely parse JSON, returning fallback on error.
 */
function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
