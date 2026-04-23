# TokenFlow 48-Hour Implementation Plan

## Goal
Ship three judge-impact features in 2 days with minimal risk:
- Autonomous Supervisor Agent
- Red-Team Simulation Mode
- Incident Replay + Compliance Export

## Time Constraint Strategy
Because you have ~2 days, this plan is MVP-first:
- Reuse existing workflow, token, audit, and testbench plumbing
- Add thin orchestrator layer instead of rebuilding execution engine
- Prioritize visible end-to-end demo over broad feature coverage

## Existing Building Blocks to Reuse
- Workflow checkpoints and attack hooks: server/src/engine/workflowRunner.js
- Token chain + audit logs: server/src/engine/tokenEngine.js
- Scenario runner + persisted test runs: server/src/engine/testbenchEngine.js
- Scenario catalog: server/src/data/agentTasks.js
- Workflow control endpoints: server/src/routes/workflowRoutes.js
- Existing PDF export endpoint path: server/src/routes/reportRoutes.js
- Existing incident explainer page: client/src/pages/IncidentPage.jsx
- Existing monitor/review controls: client/src/App.jsx (Security area)

## Scope (Strict MVP)

### 1) Autonomous Supervisor Agent (MVP)
Deliver:
- Deterministic risk score from runtime signals
- Automated decision ladder: allow, pause, kill
- Structured supervisor rationale in audit trail

Do not do now:
- ML-based anomaly model training
- Complex policy authoring UI

### 2) Red-Team Simulation Mode (MVP)
Deliver:
- One-click "Run Red-Team Campaign"
- Campaign = sequence of existing attack scenarios + summary
- Campaign report in UI (pass/fail, blocked rate, containment time)

Do not do now:
- New large scenario authoring system
- External traffic generators

### 3) Incident Replay + Compliance Export (MVP)
Deliver:
- Replay timeline for one run from audit_log + token_chain
- Export JSON + PDF compliance packet for selected run
- Basic control mapping table (evidence -> control claim)

Do not do now:
- Full standards engine for every framework
- Multi-report comparison analytics

---

## 48-Hour Execution Schedule

## Day 1 (Backend Core + API)

### Block 1 (2.5h): Supervisor Engine
Files:
- Add server/src/services/orchestrationSupervisor.js
- Add server/src/engine/supervisorRiskModel.js
- Patch server/src/engine/workflowRunner.js

Tasks:
- Implement computeRisk(input): returns riskScore 0-100 and reasons[]
- Implement decideAction(score, context): allow/pause/kill
- Hook decision points at:
  - before token mint
  - before step execute
  - after flagged events
- Emit supervisor events into existing audit stream details:
  - SUPERVISOR_EVALUATED
  - SUPERVISOR_PAUSED
  - SUPERVISOR_KILLED

Acceptance:
- A malicious scenario triggers pause/kill without manual click
- Audit log contains machine-readable rationale payload

### Block 2 (2h): Red-Team Campaign API
Files:
- Add server/src/routes/redteamRoutes.js
- Patch server/src/index.js (route registration)
- Patch server/src/engine/testbenchEngine.js

Tasks:
- Add POST /api/redteam/run
- Campaign IDs include existing attack-heavy scenarios from agentTasks
- Collect metrics:
  - total scenarios
  - blocked_count
  - failed_invariants
  - mean_containment_ms
- Persist campaign summary in SQLite (or reuse test_runs summary for speed)

Acceptance:
- Single API call runs campaign and returns summarized results

### Block 3 (2h): Replay + Export API
Files:
- Add server/src/routes/replayRoutes.js
- Patch server/src/routes/reportRoutes.js (extend payload options)
- Patch server/src/index.js

Tasks:
- Add GET /api/replay/:workflowId
  - return ordered timeline merged from audit_log + token_chain
- Add GET /api/compliance/export/:workflowId?format=json|pdf
  - JSON: run metadata, supervisor decisions, violations, controls mapping
  - PDF: concise 1-page report (reuse current pdf flow)

Acceptance:
- You can export one blocked run as JSON and PDF from API

### Block 4 (1h): Backend tests + smoke
Files:
- Add server/src/tests/supervisor.test.js
- Add server/src/tests/redteam.test.js
- Add server/src/tests/replayExport.test.js

Tasks:
- Unit test decision ladder thresholds
- Integration test campaign endpoint
- Integration test replay ordering and export success

Acceptance:
- New tests pass locally for added modules

---

## Day 2 (Frontend + Demo Polish)

### Block 5 (2h): Red-Team UI
Files:
- Add client/src/pages/RedTeamPage.jsx
- Patch client/src/App.jsx
- Patch client/src/api.js

Tasks:
- Add Run Red-Team Campaign button
- Show scenario-by-scenario outcomes + summary cards
- Add quick "Open incident replay" CTA for failed/blocked runs

Acceptance:
- Judges can run campaign in one click and see immediate measurable output

### Block 6 (2h): Replay UI
Files:
- Add client/src/pages/ReplayPage.jsx
- Patch client/src/App.jsx
- Optional: patch client/src/pages/IncidentPage.jsx to link replay

Tasks:
- Timeline playback controls: play/pause/step
- Event chips for token states + supervisor decisions
- Highlight first containment moment

Acceptance:
- A blocked attack can be replayed clearly in under 60 seconds

### Block 7 (1.5h): Compliance Export UI
Files:
- Patch client/src/pages/ReplayPage.jsx
- Optional patch client/src/pages/WorkflowScorePage.jsx

Tasks:
- Add Export JSON and Export PDF buttons
- Show control-mapping summary table (small, clear)
- Add "Generated at" and run ID for audit traceability

Acceptance:
- Export files download and are demo-ready

### Block 8 (2h): Demo hardening + fallback paths
Tasks:
- Add deterministic demo seed/reset sequence
- Script one "happy path" and one "attack blocked" path
- Ensure graceful error states for missing data
- Build and run tests

Acceptance:
- Demo survives app reset and repeated judge clicks

---

## Minimal Technical Design

### Supervisor Decision Thresholds (initial)
- 0-39: allow
- 40-69: pause
- 70-100: kill + revoke

Signals (weighted deterministic score):
- unauthorized service/resource attempt (+40)
- replay token usage (+25)
- escalation verb mismatch (+20)
- fairness gate violation (+15)
- repeated anomaly burst in same workflow (+10)

### Compliance Mapping (MVP table)
- Credential isolation -> Vault-proxied access evidence
- Least privilege -> token scope checks + denied escalation events
- Detection/response -> supervisor pause/kill events + containment time
- Auditability -> immutable audit log + replay timeline

---

## API Contracts (MVP)

### POST /api/redteam/run
Response:
- campaign_id
- started_at, completed_at
- scenarios[]
- summary { total, blocked_count, failed_invariants, mean_containment_ms }

### GET /api/replay/:workflowId
Response:
- workflow
- timeline[] ordered by timestamp
- containment_event

### GET /api/compliance/export/:workflowId?format=json|pdf
Response:
- JSON body or PDF stream
- includes supervisor rationale + control mapping

---

## Validation Checklist
- npm.cmd run build
- node --test server/src/tests/testbench.test.js
- node --test server/src/tests/supervisor.test.js
- node --test server/src/tests/redteam.test.js
- node --test server/src/tests/replayExport.test.js

If time is short, prioritize:
1. supervisor.test.js
2. redteam campaign endpoint smoke test
3. one replay ordering test

---

## Judge Demo Script (5 minutes)
1. Run Red-Team Campaign (show attack suite starts)
2. Open one blocked run
3. Replay timeline: show exact point supervisor paused/killed
4. Export compliance PDF and show control mapping
5. Close with metric slide:
   - blocked unsafe actions
   - containment time
   - audit completeness

---

## Risk Register (2-day reality)
- Risk: Over-building supervisor logic
  - Mitigation: deterministic rules first, no ML model training
- Risk: UI complexity
  - Mitigation: one Red-Team page + one Replay page only
- Risk: Test instability
  - Mitigation: deterministic seed and fixed scenario set

---

## Definition of Done
- Autonomous supervisor automatically contains risky workflows
- Red-team campaign runs in one click with measurable summary
- Any campaign run can be replayed and exported as compliance evidence
- End-to-end demo executes without manual recovery
