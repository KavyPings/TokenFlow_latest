import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { closeDb, getDb } from '../db/database.js';

let tempRoot = null;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  closeDb();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  if (tempRoot) {
    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

describe('Database path setup', () => {
  it('creates missing parent directories for file-backed SQLite databases', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'tokenflow-db-'));
    const dbPath = join(tempRoot, 'nested', 'path', 'tokenflow.db');
    const parentDir = dirname(dbPath);

    process.env.DATABASE_URL = dbPath;

    assert.equal(existsSync(parentDir), false);
    assert.doesNotThrow(() => getDb());
    assert.equal(existsSync(parentDir), true);
  });

  it('falls back to local SQLite when DATABASE_URL is a Postgres URL', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
    assert.doesNotThrow(() => getDb());
  });
});
