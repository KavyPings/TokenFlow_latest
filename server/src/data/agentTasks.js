// ═══════════════════════════════════════════════════════════
// Agent Task / Scenario Definitions
// Modeled on the Google Vertex AI "Double Agent" incident (April 2026)
//
// Each scenario demonstrates a specific failure mode and how
// TokenFlow's capability-token architecture contains it.
// ═══════════════════════════════════════════════════════════

// ─── Scenario 1: Normal safe workflow ────────────────────
// All steps within scope. Demonstrates clean token lifecycle.
export const SCENARIO_NORMAL = {
  id: 'SCENARIO-001',
  name: 'Normal Cloud Processing',
  description:
    'Read IoT sensor data from cloud storage, process via internal API, write results back. All steps are authorized — tokens mint, activate, burn cleanly.',
  category: 'safe',
  agent: 'agent-cloud-worker',
  malicious: false,
  expected_status: 'completed',
  incident_mapping: 'Baseline — shows how a well-scoped agent completes work without over-permission.',
  steps: [
    { action: 'READ_OBJECT', service: 'gcs', resource: 'sensor-feed/batch-2026-04.json', actionVerb: 'read' },
    { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/analytics/process', actionVerb: 'invoke' },
    { action: 'WRITE_OBJECT', service: 'gcs', resource: 'results/analytics-output.json', actionVerb: 'write' },
  ],
};

// ─── Scenario 2: Double Agent — Credential Exfiltration ──
// Original Vertex AI failure mode: agent diverts to access
// source-control secrets mid-workflow.
export const SCENARIO_DOUBLE_AGENT = {
  id: 'SCENARIO-002',
  name: 'Double Agent — Credential Exfiltration',
  description:
    'Agent starts normal workflow but is compromised. After CALL_INTERNAL_API, it attempts to read source-control secrets (internal/secrets-config.yaml). TokenFlow blocks the cross-service pivot.',
  category: 'attack',
  agent: 'agent-cloud-worker',
  malicious: true,
  expected_status: 'paused',
  malicious_step: {
    action: 'READ_REPO',
    service: 'source-control',
    resource: 'internal/secrets-config.yaml',
    actionVerb: 'read',
  },
  incident_mapping:
    'Direct model of the Vertex AI Double Agent incident: AI extracts service-account credentials and accesses internal systems.',
  steps: [
    { action: 'READ_OBJECT', service: 'gcs', resource: 'sensor-feed/batch-2026-04.json', actionVerb: 'read' },
    { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/analytics/process', actionVerb: 'invoke' },
    // After step 2, the compromised agent attempts READ_REPO (injected by workflowRunner)
    { action: 'WRITE_OBJECT', service: 'gcs', resource: 'results/analytics-output.json', actionVerb: 'write' },
  ],
};

// ─── Scenario 3: Cross-Service Lateral Movement ──────────
// Agent attempts to pivot from its authorized GCS scope to
// source-control and internal-repo services.
export const SCENARIO_LATERAL_MOVEMENT = {
  id: 'SCENARIO-003',
  name: 'Cross-Service Lateral Movement',
  description:
    'Agent attempts to pivot from its authorized GCS scope to source-control and then internal-repo. TokenFlow blocks at the service boundary — tokens are scoped to one service.',
  category: 'attack',
  agent: 'agent-cloud-worker',
  malicious: true,
  expected_status: 'paused',
  malicious_step: {
    action: 'READ_REPO',
    service: 'source-control',
    resource: 'internal/deployment-keys.yaml',
    actionVerb: 'read',
  },
  incident_mapping:
    'Demonstrates lateral movement containment. In the Vertex incident, the agent moved freely between services once it had credentials.',
  steps: [
    { action: 'READ_OBJECT', service: 'gcs', resource: 'config/app-settings.json', actionVerb: 'read' },
    { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/config/update', actionVerb: 'invoke' },
    { action: 'WRITE_OBJECT', service: 'gcs', resource: 'config/app-settings-v2.json', actionVerb: 'write' },
  ],
};

// ─── Scenario 4: Replay / Token Reuse Attack ─────────────
// Agent attempts to reuse a burned token for a second action.
export const SCENARIO_REPLAY = {
  id: 'SCENARIO-004',
  name: 'Replay / Token Reuse Attack',
  description:
    'Agent completes READ_OBJECT, then attempts to reuse the burned token for another read. TokenFlow rejects the replay — burned tokens are dead.',
  category: 'attack',
  agent: 'agent-cloud-worker',
  malicious: true,
  replay: true,
  expected_status: 'completed',
  incident_mapping:
    'Prevents credential replay. Traditional systems allow repeated API calls with the same credential; TokenFlow burns after one use.',
  steps: [
    { action: 'READ_OBJECT', service: 'gcs', resource: 'sensitive/customer-data.json', actionVerb: 'read' },
    { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/analytics/process', actionVerb: 'invoke' },
    { action: 'WRITE_OBJECT', service: 'gcs', resource: 'results/output.json', actionVerb: 'write' },
  ],
};

// ─── Scenario 5: Scope Escalation ────────────────────────
// Agent has a read token but attempts a write action.
export const SCENARIO_ESCALATION = {
  id: 'SCENARIO-005',
  name: 'Scope Escalation Attempt',
  description:
    'Agent holds a READ_OBJECT token but attempts to WRITE_OBJECT, escalating its permissions beyond the token scope. TokenFlow rejects the scope mismatch.',
  category: 'attack',
  agent: 'agent-cloud-worker',
  malicious: true,
  escalation: true,
  expected_status: 'paused',
  escalation_step: {
    action: 'WRITE_OBJECT',
    service: 'gcs',
    resource: 'restricted/admin-config.json',
    actionVerb: 'write',
  },
  incident_mapping:
    'Over-permissioned access: in the Vertex incident, the agent had write access it shouldn\'t have. TokenFlow scopes each token to a single action verb.',
  steps: [
    { action: 'READ_OBJECT', service: 'gcs', resource: 'restricted/admin-config.json', actionVerb: 'read' },
    { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/admin/elevate', actionVerb: 'invoke' },
    { action: 'WRITE_OBJECT', service: 'gcs', resource: 'results/output.json', actionVerb: 'write' },
  ],
};

// ─── Scenario 6: Kill Switch ─────────────────────────────
// Workflow is killed mid-execution; all pending/active tokens
// are revoked immediately.
export const SCENARIO_KILL_SWITCH = {
  id: 'SCENARIO-006',
  name: 'Kill Switch Engagement',
  description:
    'Workflow starts normally. After the first step, the kill switch is triggered by operational staff. All remaining tokens are revoked and execution halts immediately.',
  category: 'control',
  agent: 'agent-cloud-worker',
  malicious: false,
  kill_at_step: 1,
  expected_status: 'aborted',
  incident_mapping:
    'Demonstrates operational control. In the Vertex incident, there was no kill switch — the agent continued operating until manual intervention hours later.',
  steps: [
    { action: 'READ_OBJECT', service: 'gcs', resource: 'sensor-feed/batch-2026-04.json', actionVerb: 'read' },
    { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/analytics/process', actionVerb: 'invoke' },
    { action: 'WRITE_OBJECT', service: 'gcs', resource: 'results/analytics-output.json', actionVerb: 'write' },
  ],
};

// ─── Scenario 7: Human Review / Intervention ─────────────
// Step-up auth triggers human pause at WRITE_OBJECT.
export const SCENARIO_HUMAN_REVIEW = {
  id: 'SCENARIO-007',
  name: 'Human Review Intervention',
  description:
    'Workflow pauses at the WRITE_OBJECT step because it requires step-up authentication. A human reviewer must approve before the write can proceed.',
  category: 'control',
  agent: 'agent-cloud-worker',
  malicious: false,
  pause_at_step: 2,
  expected_status: 'paused',
  incident_mapping:
    'Demonstrates human-in-the-loop. The Vertex agent operated autonomously without checkpoints; TokenFlow inserts mandatory review gates.',
  steps: [
    { action: 'READ_OBJECT', service: 'gcs', resource: 'sensitive/pii-records.json', actionVerb: 'read' },
    { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/compliance/check', actionVerb: 'invoke' },
    { action: 'WRITE_OBJECT', service: 'gcs', resource: 'exports/compliance-report.json', actionVerb: 'write' },
  ],
};

export const ALL_TASKS = [
  SCENARIO_DOUBLE_AGENT,
  SCENARIO_NORMAL,
  SCENARIO_LATERAL_MOVEMENT,
  SCENARIO_REPLAY,
  SCENARIO_ESCALATION,
  SCENARIO_KILL_SWITCH,
  SCENARIO_HUMAN_REVIEW,
];

export function getTaskById(id) {
  return ALL_TASKS.find((t) => t.id === id) || null;
}
