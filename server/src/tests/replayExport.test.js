import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import '../loadEnv.js';
import { getDb, closeDb } from '../db/database.js';
import replayRoutes from '../routes/replayRoutes.js';
import { workflowRunner } from '../engine/workflowRunner.js';
import { getTaskById } from '../data/agentTasks.js';

let server;
let baseUrl;
let workflowId;

before(async () => {
  process.env.DATABASE_URL = ':memory:';
  getDb();

  const scenario = getTaskById('SCENARIO-002');
  const started = await workflowRunner.startWorkflow(scenario, {
    deterministic: true,
    stepDelay: 15,
    workflowType: 'testbench',
  });
  workflowId = started.workflowId;

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const workflow = workflowRunner.getWorkflow(workflowId);
    if (['paused', 'aborted', 'completed'].includes(workflow?.status)) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  const app = express();
  app.use('/api/replay', replayRoutes);
  app.use('/api/compliance', replayRoutes);
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb();
});

describe('Replay and compliance export endpoints', () => {
  it('returns ordered replay timeline', async () => {
    const response = await fetch(`${baseUrl}/api/replay/${workflowId}`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(payload.timeline));
    assert.ok(payload.timeline.length > 0);
    assert.ok(payload.containment_event);
  });

  it('returns JSON compliance payload', async () => {
    const response = await fetch(`${baseUrl}/api/compliance/export/${workflowId}?format=json`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(payload.controls_mapping));
    assert.ok(Array.isArray(payload.supervisor_decisions));
  });

  it('returns PDF compliance export stream', async () => {
    const response = await fetch(`${baseUrl}/api/compliance/export/${workflowId}?format=pdf`);
    assert.equal(response.status, 200);
    assert.ok((response.headers.get('content-type') || '').includes('application/pdf'));
    const body = await response.arrayBuffer();
    assert.ok(body.byteLength > 0);
  });
});
