# TokenFlow OS — Next-Level Implementation Plan
### Google Solution Challenge: Winning Submission Roadmap

---

## The Core Problem We Must Solve First

Before any feature work: **the project feels like a demo because it IS a demo.**

The 3-step workflow (READ_OBJECT → CALL_INTERNAL_API → WRITE_OBJECT) is abstract. Nobody watching can connect it to a real situation they care about. The solution challenge judges need to immediately understand *why this matters* and *who it protects*.

**The pivot: TokenFlow needs ONE real, end-to-end story — a loan application.**

The SUBMISSION.md already describes this. A loan application where:
- Token A reads applicant record
- Token B runs credit scoring (real Gemini call)
- Token C performs approval decision (with fairness check inline)
- Token D sends decision email (via vault-brokered SendGrid)

**Everything else in this plan supports making that story real.**

---

## Project Health Gaps (Current State)

| Gap | Severity | Impact |
|---|---|---|
| Workflows are abstract 3 mock steps | Critical | Judges can't relate to real-world risk |
| No real AI — everything is setTimeout | Critical | "Demo" feel kills credibility |
| New users have NO idea what to do first | High | First impression is confusion |
| SQLite is ephemeral on Render | High | Demo data lost on redeploy |
| Fairness module decoupled from workflows | High | Looks like a separate tool bolted on |

---

## Phase 1 — Real AI Backbone (Gemini Integration)

### 1.1 New service: `server/src/services/geminiService.js`
Wraps `@google/generative-ai`. Each workflow step maps to a structured Gemini prompt:

| Step | Gemini Prompt Role |
|---|---|
| `READ_OBJECT` | Summarize applicant data |
| `CALL_INTERNAL_API` | Assess credit risk score with reasoning |
| `WRITE_OBJECT` | Generate approval/rejection letter text |

### 1.2 Modify: `server/src/engine/workflowRunner.js`
Call `geminiService.runGeminiStep()` instead of `await delay()`. Stream Gemini response into audit log.

### 1.3 New service: `server/src/services/gcsService.js`
Real GCS read/write in production. Falls back to mock JSON in dev. Applicant records at `applicants/{id}.json`.

### 1.4 New service: `server/src/services/emailService.js`
Auth0 Token Exchange for SendGrid API key. Agent never sees the key — vault brokers the send.

---

## Phase 2 — The Loan Decision Demo (Concrete Narrative)

Replace abstract 3-step workflow with the loan application story from SUBMISSION.md.

### 2.1 Modify: `server/src/data/agentTasks.js`
Add `LOAN_DECISION` workflow with 6 token-gated steps plus attack variants:
- `DOUBLE_AGENT_LOAN`: Agent tries to read OTHER applicants' files
- `DATA_EXFILTRATION`: Agent tries to write to external endpoint
- `BIAS_BYPASS`: Agent tries to skip fairness check

### 2.2 New page: `client/src/pages/LiveCasePage.jsx`
Visual "case file" panel that shows the active applicant as the workflow runs:
- Name, age, ZIP, income bracket
- Credit score updating live
- Fairness flags highlighted in real time
- Decision badge at the end

### 2.3 Modify: `server/src/engine/workflowRunner.js`
After credit scoring step, call fairness engine inline. If protected attribute triggers violation → emit `FAIRNESS_FLAG` → human review gate auto-activates.

---

## Phase 3 — UX Overhaul (From Complex Demo → Intuitive Product)

### 3.1 New component: `client/src/components/OnboardingWizard.jsx`
4-step guided onboarding on first visit:
1. The Double Agent incident in 90 words + animation
2. Animated token lifecycle visual
3. Pre-selects SCENARIO_DOUBLE_AGENT — one click
4. Auto-runs, shows BLOCKED result

Zero reading required. Judges click through and understand in 60 seconds.

### 3.2 New component: `client/src/components/ContextTooltip.jsx`
Hoverable `?` badges on every technical term. Plain-English explanations inline.

### 3.3 New component: `client/src/components/ReplayViewer.jsx`
After testbench run completes, animated frame-by-frame replay of the attack sequence.

### 3.4 Modify: `client/src/pages/LandingPage.jsx`
One giant red CTA button: **"SIMULATE THE DOUBLE AGENT ATTACK"**

This button: pre-selects the attack scenario → navigates to Dashboard → auto-runs → shows BLOCKED. Zero friction.

### 3.5 Modify: `client/src/App.jsx` (Dashboard Overview)
New layout replacing the abstract hero:
```
┌──────────────────────────────────────────────────────────────┐
│  ACTIVE CASE: [Applicant Name] — [Status]              [⚡] │
├──────────────────────┬───────────────────────────────────────┤
│  WORKFLOW PROGRESS   │  LIVE TOKEN CHAIN                     │
│  [animated stepper]  │  [vertical timeline]                  │
├──────────────────────┴───────────────────────────────────────┤
│  RECENT SECURITY EVENTS          FAIRNESS SIGNAL             │
│  [event feed]                    [gauge widget]              │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 4 — Scalability Infrastructure

### 4.1 PostgreSQL migration
Migrate `server/src/db/` from `better-sqlite3` → `pg`. Use Neon (free tier, persistent). Keep SQLite fallback for local dev.

### 4.2 Multi-tenant workspace support
Add `workspace_id` to all tables. New middleware: `server/src/middleware/workspaceMiddleware.js`.

### 4.3 Redis pub/sub WebSocket
Route WebSocket events through Redis so multiple server instances can broadcast. New: `server/src/websocket/redisPubSub.js`.

### 4.4 Rate limiting + hardening
Add `express-rate-limit`, `helmet`, `zod` schema validation on all upload endpoints.

### 4.5 Testbench history persistence
All runs persisted in PostgreSQL. New endpoint `GET /api/testbench/history`. Run comparison: did guardrails hold across versions?

---

## Phase 5 — Competition Polish

### 5.1 New page: `client/src/pages/ScoringPage.jsx`
Live compliance score computed from audit completeness, flagged ratio, fairness gate, invariant pass rate.

### 5.2 Modify: `client/src/pages/IncidentPage.jsx`
Interactive animated architecture diagram replacing static table. Click any step to see what gets blocked.

### 5.3 New: `server/src/routes/demoRoutes.js`
`POST /api/demo/reset` — resets DB to clean state with seeded applicants. Judges can refresh demo without redeploying.

### 5.4 New: `server/src/routes/reportRoutes.js`
`GET /api/report/pdf` — generates a PDF security audit report using `pdfkit`.

---

## Execution Priority

### 🔴 Must Do (Competition-Critical)
1. Loan Decision narrative + agentTasks.js rewrite
2. "Run the Attack" one-click CTA on Home page
3. Onboarding Wizard
4. PostgreSQL migration (stop losing demo data)
5. Gemini integration for credit scoring

### 🟡 Should Do (Score Multipliers)
6. Live Case panel (applicant visual)
7. Fairness inline integration into workflow runner
8. Demo reset endpoint + seed data
9. Interactive architecture diagram
10. Compliance score widget

### 🟢 Nice to Have
11. Replay viewer for testbench runs
12. Redis pub/sub WebSocket
13. Multi-tenant workspace scoping
14. PDF report generation
15. Shareable run deep links

---

## Why This Wins

| Judging Criterion | Current | After |
|---|---|---|
| Impact | Abstract security demo | Prevents real loan bias + AI misuse |
| Innovation | Token-based execution | Token + Gemini + fairness inline + real vault |
| Technical depth | Mock setTimeout | Real AI, real GCS, real Auth0, PostgreSQL |
| Presentation | Confusing tabs | 60-second onboarding → one button → attack blocked |
| Scalability | SQLite single-user | PostgreSQL, multi-tenant, Redis WebSocket |
| Google tech | Auth0 Vault | Vault + Gemini 1.5 Flash + GCS + Vertex AI safety |
