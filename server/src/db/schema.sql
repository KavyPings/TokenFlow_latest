-- TokenFlow OS Database Schema
-- Capability tokens, audit logs, workflows, vault credentials,
-- testbench results, and uploaded workflow definitions.

-- ═══════════════════════════════════════════════════════════
-- Capability Tokens
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  resource_id TEXT,
  agent_id TEXT NOT NULL,
  minted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  context TEXT DEFAULT '{}',
  parent_token_id TEXT,
  step_index INTEGER NOT NULL,
  nonce TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Immutable Audit Log
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  details TEXT DEFAULT '{}',
  timestamp TEXT DEFAULT (datetime('now')),
  actor TEXT NOT NULL
);

-- ═══════════════════════════════════════════════════════════
-- Workflow Runs
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  applicant_data TEXT DEFAULT '{}',
  workflow_type TEXT NOT NULL DEFAULT 'mission',
  hidden_from_chain INTEGER NOT NULL DEFAULT 0,
  current_step INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Credential Vault Registry (names only, never values)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS vault_credentials (
  id TEXT PRIMARY KEY,
  service_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  connection_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  last_accessed TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Testbench Results — persisted pass/fail results
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  assertions TEXT DEFAULT '[]',
  summary TEXT DEFAULT '{}',
  token_chain TEXT DEFAULT '[]',
  audit_log TEXT DEFAULT '[]',
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER DEFAULT 0
);

-- ═══════════════════════════════════════════════════════════
-- Uploaded Workflow Definitions
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS uploaded_workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  definition TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'validated',
  validation_errors TEXT DEFAULT '[]',
  last_error TEXT DEFAULT '',
  uploaded_at TEXT DEFAULT (datetime('now')),
  last_run_at TEXT
);

-- ═══════════════════════════════════════════════════════════
-- Fairness Audit — Uploaded Datasets
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fairness_datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('csv', 'json')),
  row_count INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL DEFAULT '{}',
  profile TEXT DEFAULT NULL,
  data_blob TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','profiled','analyzed','error')),
  error_message TEXT DEFAULT NULL,
  uploaded_by TEXT DEFAULT 'system',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Fairness Audit — Immutable Audit Logs
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fairness_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT DEFAULT '{}',
  config_snapshot TEXT DEFAULT NULL,
  metrics_snapshot TEXT DEFAULT NULL,
  actor TEXT DEFAULT 'system',
  timestamp TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Fairness Audit — Generated Reports
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fairness_reports (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  report TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK(risk_level IN ('low','medium','high')),
  violation_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Fairness Audit — Review Queue (flagged violations)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fairness_review_queue (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  attribute TEXT NOT NULL,
  expected_range TEXT NOT NULL,
  actual_value REAL NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high')),
  policy_level TEXT NOT NULL DEFAULT 'warning' CHECK(policy_level IN ('warning','block')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','dismissed')),
  reviewer TEXT DEFAULT NULL,
  review_notes TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Fairness Audit — Mitigation Reports
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fairness_mitigation_reports (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'threshold_adjustment',
  config TEXT NOT NULL DEFAULT '{}',
  before_metrics TEXT NOT NULL DEFAULT '{}',
  after_metrics TEXT NOT NULL DEFAULT '{}',
  deltas TEXT NOT NULL DEFAULT '{}',
  impacted_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Fairness Audit — Row-Level Impacted Cases
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fairness_impacted_cases (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  mitigation_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  original_pred INTEGER NOT NULL,
  adjusted_pred INTEGER NOT NULL,
  group_name TEXT NOT NULL,
  attribute TEXT NOT NULL,
  trigger_metric TEXT NOT NULL,
  original_score REAL DEFAULT NULL,
  adjusted_threshold REAL DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Fairness Audit — Gate Decisions (operational metrics)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fairness_gate_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  allowed INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('shadow','enforce')),
  decision TEXT NOT NULL CHECK(decision IN ('ALLOW','BLOCK')),
  message TEXT NOT NULL,
  blocking_datasets TEXT DEFAULT '[]',
  blocking_items TEXT DEFAULT '[]',
  evaluation_ms REAL NOT NULL DEFAULT 0,
  triggered_by TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- Fairness Audit — Immutability Triggers
-- ═══════════════════════════════════════════════════════════
CREATE TRIGGER IF NOT EXISTS prevent_audit_log_update
  BEFORE UPDATE ON fairness_audit_logs
  BEGIN SELECT RAISE(ABORT, 'Fairness audit logs are immutable — UPDATE is not allowed'); END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_log_delete
  BEFORE DELETE ON fairness_audit_logs
  BEGIN SELECT RAISE(ABORT, 'Fairness audit logs are immutable — DELETE is not allowed'); END;

-- ═══════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tokens_workflow ON tokens(workflow_id);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_nonce ON tokens(nonce);
CREATE INDEX IF NOT EXISTS idx_audit_workflow ON audit_log(workflow_id);
CREATE INDEX IF NOT EXISTS idx_audit_token ON audit_log(token_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_scenario ON test_runs(scenario_id);
CREATE INDEX IF NOT EXISTS idx_fairness_datasets_status ON fairness_datasets(status);
CREATE INDEX IF NOT EXISTS idx_fairness_audit_logs_dataset ON fairness_audit_logs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_fairness_reports_dataset ON fairness_reports(dataset_id);
CREATE INDEX IF NOT EXISTS idx_fairness_review_queue_dataset ON fairness_review_queue(dataset_id);
CREATE INDEX IF NOT EXISTS idx_fairness_review_queue_status ON fairness_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_fairness_mitigation_reports_dataset ON fairness_mitigation_reports(dataset_id);
CREATE INDEX IF NOT EXISTS idx_fairness_impacted_cases_dataset ON fairness_impacted_cases(dataset_id);
CREATE INDEX IF NOT EXISTS idx_fairness_impacted_cases_group ON fairness_impacted_cases(group_name);
CREATE INDEX IF NOT EXISTS idx_fairness_impacted_cases_mitigation ON fairness_impacted_cases(mitigation_id);
CREATE INDEX IF NOT EXISTS idx_fairness_gate_decisions_created ON fairness_gate_decisions(created_at);

