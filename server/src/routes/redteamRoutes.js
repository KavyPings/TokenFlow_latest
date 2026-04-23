import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { testbenchEngine } from '../engine/testbenchEngine.js';
import { tokenEngine } from '../engine/tokenEngine.js';

const router = Router();

function toMs(value) {
  const ms = Date.parse(value || '');
  return Number.isNaN(ms) ? null : ms;
}

function computeContainmentMs(workflowId) {
  const auditLog = tokenEngine.getAuditLog(workflowId);
  const firstThreat = auditLog.find((entry) => ['FLAGGED', 'REPLAY_REJECTED'].includes(entry.event_type));
  const containment = auditLog.find((entry) => ['SUPERVISOR_PAUSED', 'SUPERVISOR_KILLED', 'REVOKED'].includes(entry.event_type));
  const threatMs = toMs(firstThreat?.timestamp);
  const containMs = toMs(containment?.timestamp);
  if (threatMs === null || containMs === null) return null;
  return Math.max(0, containMs - threatMs);
}

router.post('/run', async (req, res) => {
  try {
    const scenarios = testbenchEngine
      .getScenarios()
      .filter((scenario) => scenario.category === 'attack');

    if (scenarios.length === 0) {
      return res.status(400).json({ error: 'No attack scenarios available for campaign.' });
    }

    const campaign_id = `rtc_${uuidv4().slice(0, 10)}`;
    const started_at = new Date().toISOString();
    const runs = [];

    for (const scenario of scenarios) {
      // eslint-disable-next-line no-await-in-loop
      const result = await testbenchEngine.runScenario(scenario.id);
      const containment_ms = result.workflowId ? computeContainmentMs(result.workflowId) : null;
      const blocked =
        ['paused', 'aborted'].includes(result.workflowStatus) ||
        (result.summary?.workflowStatus && ['paused', 'aborted'].includes(result.summary.workflowStatus));
      runs.push({
        scenario_id: scenario.id,
        scenario_name: scenario.name,
        status: result.status,
        workflow_id: result.workflowId || null,
        workflow_status: result.workflowStatus || result.summary?.workflowStatus || null,
        blocked,
        failed_assertions: result.failed || 0,
        containment_ms,
      });
    }

    const completed_at = new Date().toISOString();
    const blocked_count = runs.filter((item) => item.blocked).length;
    const failed_invariants = runs.reduce((sum, item) => sum + item.failed_assertions, 0);
    const containmentValues = runs.map((item) => item.containment_ms).filter((v) => typeof v === 'number');
    const mean_containment_ms = containmentValues.length
      ? Math.round(containmentValues.reduce((a, b) => a + b, 0) / containmentValues.length)
      : null;

    return res.json({
      success: true,
      campaign_id,
      started_at,
      completed_at,
      scenarios: runs,
      summary: {
        total: runs.length,
        blocked_count,
        failed_invariants,
        mean_containment_ms,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
