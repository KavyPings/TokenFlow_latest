# Changes Log

This file tracks frontend changes made from this point onward.

## Entry format
- Date
- Summary
- Files touched
- Why

---

## 2026-04-23
### Summary
- Simplified top-level frontend navigation into grouped views:
  - Run
  - Monitor
  - Governance
- Added compatibility navigation mapping so legacy page targets still route correctly.
- Added Monitor and Governance sub-tabs for clearer flow.

### Files touched
- client/src/App.jsx

### Why
- Reduce UI complexity and make the app easier to understand and maintain while preserving existing behavior.

## 2026-04-23 (follow-up)
### Summary
- Removed unused legacy frontend code path (`OverviewTab`) from the main app file.
- Updated dashboard guide copy to use the new grouped navigation language (Run, Monitor, Governance).
- Updated user-facing docs to match the simplified information architecture.

### Files touched
- client/src/App.jsx
- README.md
- USER_GUIDE.md

### Why
- Lower maintenance overhead, reduce confusion from outdated labels, and keep implementation/documentation aligned for easier scaling.

## 2026-04-24
### Summary
- Extracted Monitor and Governance tab containers from the app shell into dedicated page files.
- Rewired App routing render block to use these container modules while preserving all existing child views and behavior.
- Removed an unused UploadPage import from the app shell.

### Files touched
- client/src/App.jsx
- client/src/pages/MonitorPage.jsx
- client/src/pages/GovernancePage.jsx

### Why
- Keep the main app shell focused on orchestration, reduce cognitive load in one oversized file, and improve scalability without changing functionality.

## 2026-04-24 (docs)
### Summary
- Added a dedicated guide explaining what the Governance Score tab does.
- Added step-by-step instructions to see Score behavior live in action.

### Files touched
- SCORE_TAB_GUIDE.md

### Why
- Make the score feature easier to understand for demos, onboarding, and repeatable testing.

## 2026-04-23 (workflow/dataset split)
### Summary
- Renamed top navigation labels:
  - Run -> Workflow Management
  - Governance -> Dataset Management
- Refactored Workflow Management tabs to:
  - Mock Workflows
  - Uploaded Workflows
  - Token Chain
  - Testbench
  - Workflow Score
- Moved custom workflow upload/run UI out of mock launch into a dedicated Uploaded Workflows tab while preserving the same backend execution flow.
- Split score responsibilities:
  - Workflow Score under Workflow Management (workflow-only evidence)
  - Dataset Score under Dataset Management (dataset/fairness-only evidence)
- Added reusable instruction popup support and integrated "How to use" actions on major management surfaces.
- Added explicit scope messaging in Monitor and Dataset Management to clarify workflow-vs-dataset context.
- Updated docs to match renamed navigation and score split.

### Files touched
- client/src/App.jsx
- client/src/components/InstructionsDialog.jsx
- client/src/pages/WorkflowScorePage.jsx
- client/src/pages/ScoringPage.jsx
- client/src/pages/MonitorPage.jsx
- client/src/pages/GovernancePage.jsx
- README.md
- USER_GUIDE.md
- SCORE_TAB_GUIDE.md

### Why
- Make the app simpler and more scalable by separating concerns clearly: workflow execution vs dataset governance.
- Reduce user confusion by using explicit scopes, dedicated tabs, and contextual in-product instructions.
- Preserve existing backend behavior while improving frontend information architecture.

### Validation
- `npm.cmd run build` succeeded.
- `node --test .\\server\\src\\tests\\testbench.test.js` succeeded (21 passing).
- `node --test .\\server\\src\\tests\\fairnessTest.js` failed with existing test error at `server/src/tests/fairnessTest.js:268` (`TypeError: Cannot read properties of undefined (reading 'action')`).
- `node --test .\\server\\src\\tests\\fairnessApiTest.js` failed due `ECONNREFUSED` (API server not running for integration-style test).

## 2026-04-24 (enterprise rollout docs)
### Summary
- Added an enterprise rollout playbook README for deploying TokenFlow as a control layer against Google-style agent overreach incidents.
- Included a phased 30-60-90 rollout model, operating model, KPI targets, and an implementation blueprint.
- Documented a practical orchestration supervisor design for automated pause/kill decisions with risk-tiered escalation.

### Files touched
- ENTERPRISE_ROLLOUT_README.md

### Why
- Provide a concrete adoption guide for companies that want to operationalize TokenFlow beyond demo usage.
- Clarify how to automate intervention safely while preserving human approval for critical-impact decisions.

## 2026-04-24 (48-hour feature execution plan)
### Summary
- Added a focused 48-hour implementation plan for three competition-critical features:
  - Autonomous Supervisor Agent
  - Red-Team Simulation Mode
  - Incident Replay + Compliance Export
- Plan is code-mapped to existing backend/frontend files and includes strict MVP scope, day-by-day schedule, API contracts, validation checklist, and a 5-minute judge demo script.

### Files touched
- IMPLEMENTATION_PLAN_48H.md

### Why
- Team has only 2 days left; this narrows execution to the highest-impact deliverables with minimal architectural risk.
- Ensures fast implementation while still demonstrating measurable security outcomes and audit/compliance readiness.

## 2026-04-24 (llm provider abstraction + supervisor explanation endpoint)
### Summary
- Added a new backend LLM provider abstraction service supporting provider selection via environment variables (`LLM_PROVIDER=gemini|gemma`).
- Added a new API route group under `/api/llm` with:
  - `GET /api/llm/status` for active provider/model visibility
  - `POST /api/llm/supervisor/explain` for structured supervisor rationale generation
- Enforced deterministic safety guardrail in the explanation endpoint: model output cannot override deterministic action (`allow|pause|kill`) derived from risk score.
- Added schema validation and deterministic fallback when API key/model/output is unavailable or invalid.
- Documented new provider-related env vars in `.env.example`.

### Files touched
- server/src/services/llmProviderService.js
- server/src/routes/llmRoutes.js
- server/src/index.js
- .env.example

### Why
- Establishes a clean first step toward Gemini/Gemma interchangeability without changing core safety logic.
- Enables judge-facing orchestration explainability while preserving deterministic enforcement as the source of truth.

### Validation
- `node --check .\\server\\src\\services\\llmProviderService.js` passed.
- `node --check .\\server\\src\\routes\\llmRoutes.js` passed.
- `node --check .\\server\\src\\index.js` passed.
- Runtime start check failed due existing environment/runtime issues (`@google/generative-ai` missing in active install and `EADDRINUSE` on port 8000), not syntax errors in the new code.

## 2026-04-24 (48H implementation - supervisor, red-team, replay/export)
### Summary
- Implemented the 3 high-impact items from the 48H plan in a simple, demo-ready way:
  - **Autonomous Supervisor Agent** now runs automatically during workflow execution.
  - **Red-Team Simulation Mode** can now run all attack scenarios in one click.
  - **Incident Replay + Compliance Export** now supports replay timeline + JSON/PDF export.
- Added new Workflow Management tabs for:
  - Red-Team
  - Replay
- Kept existing frontend flows and pages intact (no removals of existing behavior).

### Files touched
- Backend:
  - `server/src/engine/supervisorRiskModel.js`
  - `server/src/services/orchestrationSupervisor.js`
  - `server/src/engine/workflowRunner.js`
  - `server/src/engine/tokenEngine.js`
  - `server/src/routes/redteamRoutes.js`
  - `server/src/routes/replayRoutes.js`
  - `server/src/index.js`
- Frontend:
  - `client/src/pages/RedTeamPage.jsx`
  - `client/src/pages/ReplayPage.jsx`
  - `client/src/App.jsx`
- Tests:
  - `server/src/tests/supervisor.test.js`
  - `server/src/tests/redteam.test.js`
  - `server/src/tests/replayExport.test.js`

### Why
- We needed a stronger judge demo flow:
  - attack starts
  - system auto-contains it
  - team can replay what happened
  - team can export compliance evidence
- This makes the product feel less like a prototype and more like an operational security control system.

### Validation
- `node --check` passed for all new/updated backend logic files.
- `node --test .\\server\\src\\tests\\supervisor.test.js` passed.
- `node --test .\\server\\src\\tests\\redteam.test.js` passed.
- `node --test .\\server\\src\\tests\\replayExport.test.js` passed.
- `node --test .\\server\\src\\tests\\testbench.test.js` passed (regression check).
- `npm run build` passed (frontend build).
- `npm rebuild better-sqlite3` was required once locally due Node ABI mismatch, then tests passed.
