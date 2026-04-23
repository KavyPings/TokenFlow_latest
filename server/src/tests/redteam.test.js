import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import '../loadEnv.js';
import { getDb, closeDb } from '../db/database.js';
import redteamRoutes from '../routes/redteamRoutes.js';

let server;
let baseUrl;

before(async () => {
  process.env.DATABASE_URL = ':memory:';
  getDb();
  const app = express();
  app.use(express.json());
  app.use('/api/redteam', redteamRoutes);
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

describe('Redteam campaign endpoint', () => {
  it('runs campaign and returns summary metrics', async () => {
    const response = await fetch(`${baseUrl}/api/redteam/run`, { method: 'POST' });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.ok(payload.campaign_id);
    assert.ok(Array.isArray(payload.scenarios));
    assert.ok(payload.summary.total > 0);
    assert.ok(typeof payload.summary.blocked_count === 'number');
    assert.ok(typeof payload.summary.failed_invariants === 'number');
  });
});
