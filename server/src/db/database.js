import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, isAbsolute, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

export function getDb() {
  if (db) return db;

  const dbPath = resolveDatabasePath();
  ensureSqliteDirectory(dbPath);
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Add nonce column if missing (migration for existing DBs)
  try {
    db.prepare('SELECT nonce FROM tokens LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE tokens ADD COLUMN nonce TEXT');
  }

  // Add workflow_type column if missing so testbench runs can be hidden from mission control
  try {
    db.prepare('SELECT workflow_type FROM workflows LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE workflows ADD COLUMN workflow_type TEXT NOT NULL DEFAULT 'mission'");
  }

  try {
    db.prepare('SELECT hidden_from_chain FROM workflows LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE workflows ADD COLUMN hidden_from_chain INTEGER NOT NULL DEFAULT 0");
  }

  try {
    db.prepare('SELECT step_context FROM workflows LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE workflows ADD COLUMN step_context TEXT DEFAULT '{}'");
  }

  try {
    db.prepare('SELECT workspace_id FROM workflows LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE workflows ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default'");
  }

  db.exec("UPDATE workflows SET workflow_type = 'mission' WHERE workflow_type IS NULL OR workflow_type = ''");
  db.exec('UPDATE workflows SET hidden_from_chain = 0 WHERE hidden_from_chain IS NULL');
  db.exec("UPDATE workflows SET step_context = '{}' WHERE step_context IS NULL OR step_context = ''");
  db.exec("UPDATE workflows SET workspace_id = 'default' WHERE workspace_id IS NULL OR workspace_id = ''");

  try {
    db.prepare('SELECT workspace_id FROM tokens LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE tokens ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default'");
  }
  db.exec("UPDATE tokens SET workspace_id = 'default' WHERE workspace_id IS NULL OR workspace_id = ''");

  try {
    db.prepare('SELECT workspace_id FROM audit_log LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE audit_log ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default'");
  }
  db.exec("UPDATE audit_log SET workspace_id = 'default' WHERE workspace_id IS NULL OR workspace_id = ''");

  try {
    db.prepare('SELECT workspace_id FROM test_runs LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE test_runs ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default'");
  }
  db.exec("UPDATE test_runs SET workspace_id = 'default' WHERE workspace_id IS NULL OR workspace_id = ''");

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tokens_workspace ON tokens(workspace_id)'); } catch { }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_log(workspace_id)'); } catch { }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_test_runs_workspace ON test_runs(workspace_id)'); } catch { }

  try {
    db.prepare('SELECT validation_errors FROM uploaded_workflows LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE uploaded_workflows ADD COLUMN validation_errors TEXT DEFAULT '[]'");
  }

  try {
    db.prepare('SELECT last_error FROM uploaded_workflows LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE uploaded_workflows ADD COLUMN last_error TEXT DEFAULT ''");
  }

  try {
    db.prepare('SELECT workspace_id FROM uploaded_workflows LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE uploaded_workflows ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default'");
  }

  db.exec("UPDATE uploaded_workflows SET validation_errors = '[]' WHERE validation_errors IS NULL OR validation_errors = ''");
  db.exec("UPDATE uploaded_workflows SET last_error = '' WHERE last_error IS NULL");
  db.exec("UPDATE uploaded_workflows SET workspace_id = 'default' WHERE workspace_id IS NULL OR workspace_id = ''");

  // Add policy_level column to fairness_review_queue if missing (migration for existing DBs)
  try {
    db.prepare('SELECT policy_level FROM fairness_review_queue LIMIT 1').get();
  } catch {
    try {
      db.exec("ALTER TABLE fairness_review_queue ADD COLUMN policy_level TEXT NOT NULL DEFAULT 'warning'");
    } catch { /* table may not exist yet — schema.sql will create it */ }
  }

  // Seed vault credentials if empty
  const count = db.prepare('SELECT COUNT(*) as count FROM vault_credentials').get();
  if (count.count === 0) {
    seedVaultCredentials(db);
  }

  ensureVaultCredential(db, ['cred-sendgrid', 'sendgrid-api-key', 'SendGrid API Key', 'token_vault', 'connected']);

  console.log('[DB] Database initialized');
  return db;
}

function resolveDatabasePath() {
  const configuredPath = (process.env.DATABASE_URL || '').trim();
  if (!configuredPath) return './tokenflow.db';

  const lowerCasePath = configuredPath.toLowerCase();
  if (
    lowerCasePath.startsWith('postgres://') ||
    lowerCasePath.startsWith('postgresql://') ||
    lowerCasePath.startsWith('mysql://') ||
    lowerCasePath.startsWith('mssql://') ||
    lowerCasePath.startsWith('mongodb://') ||
    lowerCasePath.startsWith('redis://')
  ) {
    console.warn('[DB] Non-SQLite DATABASE_URL detected; falling back to local SQLite at ./tokenflow.db');
    return './tokenflow.db';
  }

  return configuredPath;
}

function ensureSqliteDirectory(dbPath) {
  if (!dbPath || dbPath === ':memory:' || dbPath.startsWith('file::memory:')) return;

  let filesystemPath = dbPath;

  if (dbPath.startsWith('file:')) {
    try {
      filesystemPath = fileURLToPath(dbPath);
    } catch {
      return;
    }
  }

  const absoluteDbPath = isAbsolute(filesystemPath) ? filesystemPath : resolve(process.cwd(), filesystemPath);
  const databaseDir = dirname(absoluteDbPath);

  if (!existsSync(databaseDir)) {
    mkdirSync(databaseDir, { recursive: true });
  }
}

function seedVaultCredentials(db) {
  const insert = db.prepare(`
    INSERT INTO vault_credentials (id, service_name, display_name, connection_type, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Vertex AI–themed credentials matching the incident model
  const credentials = [
    ['cred-gcs', 'gcs-service-account', 'GCS Service Account', 'token_vault', 'connected'],
    ['cred-internal-api', 'internal-api-key', 'Internal API Key', 'token_vault', 'connected'],
    ['cred-source-control', 'source-control-token', 'Source Control Token', 'token_vault', 'restricted'],
    ['cred-sendgrid', 'sendgrid-api-key', 'SendGrid API Key', 'token_vault', 'connected'],
  ];

  const insertMany = db.transaction((creds) => {
    for (const cred of creds) {
      insert.run(...cred);
    }
  });

  insertMany(credentials);
  console.log('[DB] Seeded vault credentials');
}

function ensureVaultCredential(db, credential) {
  const existing = db.prepare('SELECT id FROM vault_credentials WHERE id = ?').get(credential[0]);
  if (existing) return;

  db.prepare(`
    INSERT INTO vault_credentials (id, service_name, display_name, connection_type, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(...credential);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Database closed');
  }
}
