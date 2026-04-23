import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import '../loadEnv.js';
import { getDb, closeDb } from '../db/database.js';
import { computeRisk, decideAction } from '../engine/supervisorRiskModel.js';
import { workflowRunner } from '../engine/workflowRunner.js';
import { getTaskById } from '../data/agentTasks.js';
import { tokenEngine } from '../engine/tokenEngine.js';

before(() => {
  process.env.DATABASE_URL = ':memory:';
  getDb();
});

after(() => {
  closeDb();
});

describe('Supervisor risk model', () => {
  it('maps deterministic thresholds correctly', () => {
    assert.equal(decideAction(10), 'allow');
    assert.equal(decideAction(45), 'pause');
    assert.equal(decideAction(80), 'kill');
  });

  it('computes weighted score and reasons', () => {
    const result = computeRisk({
      signalInput: {
        unauthorized_service_attempt: true,
        replay_token_usage: true,
      },
    });
    assert.equal(result.riskScore, 65);
    assert.ok(result.reasons.length >= 2);
  });

  it('records supervisor events on risky workflow', async () => {
    const scenario = getTaskById('SCENARIO-002');
    const started = await workflowRunner.startWorkflow(scenario, {
      deterministic: true,
      stepDelay: 15,
      workflowType: 'testbench',
    });

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const workflow = workflowRunner.getWorkflow(started.workflowId);
      if (['paused', 'aborted', 'completed'].includes(workflow?.status)) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    const auditLog = tokenEngine.getAuditLog(started.workflowId);
    assert.ok(auditLog.some((entry) => entry.event_type === 'SUPERVISOR_EVALUATED'));
    assert.ok(
      auditLog.some((entry) => ['SUPERVISOR_PAUSED', 'SUPERVISOR_KILLED'].includes(entry.event_type)),
      'Expected supervisor containment event'
    );
  });
});
