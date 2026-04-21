// ═══════════════════════════════════════════════════════════
// Execution Gate Service — Deterministic, non-configurable
// hard block when fairness state is unsafe.
//
// Block criteria (not per-run configurable):
//   1. Latest report for ANY active dataset has risk_level='high'
//   2. OR any fairness_review_queue item with severity='high'
//      and status IN ('open','acknowledged') exists
//
// Unblock path:
//   - All latest reports are low/medium risk
//   - AND all high-severity queue items are resolved/dismissed
//
// Rollout:
//   FAIRNESS_GATE_MODE=shadow  → compute+log, don't block (default)
//   FAIRNESS_GATE_MODE=enforce → hard block
// ═══════════════════════════════════════════════════════════

/**
 * Evaluate the execution gate.
 * Returns a structured decision object.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} [opts={}]
 * @param {string} [opts.triggeredBy=null] - What triggered evaluation (e.g. 'analysis', 'workflow_start')
 * @returns {{ allowed: boolean, mode: string, decision: string, message: string, blocking_datasets: object[], blocking_items: object[], evaluated_at: string, evaluation_ms: number }}
 */
export function evaluateGate(db, opts = {}) {
  const startMs = Date.now();
  const mode = getGateMode();

  // ── Check 1: Any latest report with risk_level='high' ──
  // For each analyzed dataset, get only the LATEST report
  const highRiskDatasets = db.prepare(`
    SELECT fd.id AS dataset_id, fd.name AS dataset_name, fr.risk_level, fr.id AS report_id
    FROM fairness_datasets fd
    INNER JOIN fairness_reports fr ON fr.dataset_id = fd.id
    WHERE fd.status = 'analyzed'
      AND fr.risk_level = 'high'
      AND fr.created_at = (
        SELECT MAX(fr2.created_at) FROM fairness_reports fr2 WHERE fr2.dataset_id = fd.id
      )
  `).all();

  // ── Check 2: Unresolved high-severity review items ──
  const unresolvedHighItems = db.prepare(`
    SELECT id, dataset_id, metric_name, group_name, severity, status, attribute
    FROM fairness_review_queue
    WHERE severity = 'high'
      AND status IN ('open', 'acknowledged')
    ORDER BY created_at DESC
    LIMIT 50
  `).all();

  const blocked = highRiskDatasets.length > 0 || unresolvedHighItems.length > 0;
  const evaluationMs = Date.now() - startMs;

  let message;
  if (!blocked) {
    message = 'All fairness checks passed. No high-risk reports or unresolved high-severity items.';
  } else {
    const parts = [];
    if (highRiskDatasets.length > 0) {
      parts.push(`${highRiskDatasets.length} dataset(s) with HIGH risk level`);
    }
    if (unresolvedHighItems.length > 0) {
      parts.push(`${unresolvedHighItems.length} unresolved high-severity review item(s)`);
    }
    message = `Execution blocked: ${parts.join(' and ')}. Resolve all high-risk fairness violations before launching.`;
  }

  const decision = {
    allowed: mode === 'shadow' ? true : !blocked,
    mode,
    decision: blocked ? 'BLOCK' : 'ALLOW',
    message,
    blocking_datasets: highRiskDatasets.map(d => ({
      id: d.dataset_id,
      name: d.dataset_name,
      risk_level: d.risk_level,
      report_id: d.report_id,
    })),
    blocking_items: unresolvedHighItems.map(i => ({
      id: i.id,
      dataset_id: i.dataset_id,
      metric_name: i.metric_name,
      group_name: i.group_name,
      severity: i.severity,
      status: i.status,
      attribute: i.attribute,
    })),
    evaluated_at: new Date().toISOString(),
    evaluation_ms: evaluationMs,
  };

  // Persist gate decision for operational metrics
  try {
    const stmt = db.prepare(`
      INSERT INTO fairness_gate_decisions
        (allowed, mode, decision, message, blocking_datasets, blocking_items, evaluation_ms, triggered_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      decision.allowed ? 1 : 0,
      decision.mode,
      decision.decision,
      decision.message,
      JSON.stringify(decision.blocking_datasets),
      JSON.stringify(decision.blocking_items),
      decision.evaluation_ms,
      opts.triggeredBy || null
    );
  } catch (e) {
    // Don't fail the gate evaluation if persistence fails
    console.error('[GATE] Failed to persist gate decision:', e.message);
  }

  return decision;
}

/**
 * Get the current gate mode from env.
 * @returns {'shadow'|'enforce'}
 */
export function getGateMode() {
  const envMode = String(process.env.FAIRNESS_GATE_MODE || 'shadow').toLowerCase().trim();
  return envMode === 'enforce' ? 'enforce' : 'shadow';
}

/**
 * Get gate operational metrics: count of blocked starts, recent decisions.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} [limit=20]
 * @returns {{ total_evaluations: number, blocked_count: number, allowed_count: number, recent: object[] }}
 */
export function getGateMetrics(db, limit = 20) {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN decision = 'BLOCK' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN decision = 'ALLOW' THEN 1 ELSE 0 END) AS allowed
    FROM fairness_gate_decisions
  `).get();

  const recent = db.prepare(`
    SELECT id, allowed, mode, decision, message, evaluation_ms, triggered_by, created_at
    FROM fairness_gate_decisions
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);

  return {
    total_evaluations: totals.total || 0,
    blocked_count: totals.blocked || 0,
    allowed_count: totals.allowed || 0,
    recent,
  };
}

/**
 * Custom error class for gate blocks.
 * Carries the full gate decision for structured error responses.
 */
export class FairnessGateBlockedError extends Error {
  constructor(gateDecision) {
    super(gateDecision.message);
    this.name = 'FairnessGateBlockedError';
    this.code = 'FAIRNESS_GATE_BLOCKED';
    this.gate = gateDecision;
  }
}
