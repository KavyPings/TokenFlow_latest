# TokenFlow OS

TokenFlow OS is a full-stack platform for securing and governing AI-driven decision workflows. It combines zero-trust execution controls with fairness auditing so teams can prove that automated systems are both safe and accountable.

## Inspiration

TokenFlow was inspired by the Google-related incident highlighted on our project website, which reinforced a core problem in modern AI systems: powerful automated workflows can fail when execution controls and governance safeguards are not enforced together. This project was built to address that gap by combining strict execution boundaries with fairness and compliance checks in one platform.

## What TokenFlow Solves

Modern agentic systems often fail in two places:

- Over-permissioned execution, where one compromised step can access data or services outside intended scope.
- Fairness blind spots, where decisions may systematically disadvantage protected groups.

TokenFlow addresses both in one control plane:

- Security at execution time through scoped, single-use token gating.
- Governance at decision time through fairness metrics, mitigation, and reporting.

## Core Features

### Workflow Security Engine

- Single-use, scoped token minting and consumption per workflow step.
- Replay-resistance and policy checks to block unauthorized action attempts.
- Real-time token chain visibility for minted, consumed, blocked, or revoked tokens.
- Kill switch and review queue behavior for suspicious or policy-violating flows.

### Mission Monitoring

- Dashboard for mission execution, risk posture, and system health visibility.
- Review queue and workflow logs to investigate blocked or flagged runs.
- WebSocket-powered live updates across workflow state and token events.

### Fairness and Governance

- Dataset upload and column mapping for target and protected attributes.
- Fairness metrics including SPD, DIR, EOD, and AOD.
- Risk-level evaluation and fairness gate state visibility.
- Mitigation workflow to produce adjusted outputs and impacted-case analysis.

### Reporting and Explainability

- Deterministic fairness summaries for consistent baseline reporting.
- Optional Gemini narrative generation for executive-readable analysis.
- Compliance and export endpoints to package outcomes for review.

### Enterprise Audit Flow

- Combined workflow plus dataset assessment path for end-to-end audits.
- Context-aware analysis and report generation for governance workflows.

## Product Areas in the UI

- `Workflow`: Launch mock/custom workflows, run missions, inspect token chains.
- `Monitor`: Operational status, incidents, and queue management.
- `Governance`: Fairness audits, mitigation, report generation, audit trails.
- `Enterprise`: Combined security and fairness audit flow for formal reviews.

## Tech Stack

- Frontend: React, Vite, Framer Motion, Lucide React
- Backend: Node.js, Express
- Realtime: WebSockets (`ws`)
- Data: SQLite (`better-sqlite3`) with local file persistence
- Validation and schemas: Zod
- AI integration: Google Gemini SDK (`@google/generative-ai`)

## Repository Structure

```text
.
|-- client/                 # React + Vite frontend
|-- server/                 # Express APIs, engines, governance services
|-- render.yaml             # Render web service blueprint
|-- vercel.json             # Vercel frontend build config
|-- .env.example            # Complete environment variable template
`-- package.json            # Workspace scripts for full stack
```

## Prerequisites

- Node.js 18 or newer
- npm 9 or newer

## Setup and Installation

1. Clone the repository and open it:
   ```bash
   git clone <your-repo-url>
   cd TokenFlow_latest
   ```
2. Install all workspace dependencies from the root:
   ```bash
   npm install
   ```
3. Create your runtime environment file from the template:
   - Copy `.env.example` to `.env` (root-level for this project setup).
   - Fill in required secrets and values.

Important: `.env.example` is the source of truth for required variables, defaults, and deployment notes. Keep it updated whenever config changes.

## Environment Variables

Use `.env.example` directly as your reference for:

- Frontend runtime variables (for Vite and browser-safe config)
- Auth0 integration values
- Backend service configuration (port, DB path, CORS origin)
- Optional provider keys (Gemini, OpenAI, SendGrid)
- Feature flags and fairness gate mode

Do not commit your real `.env` file.

## Running the Project Locally

From the repository root:

```bash
npm run dev
```

This starts:

- Backend on `http://localhost:8000` (default)
- Frontend on Vite dev server (typically `http://localhost:5173`)

Useful scripts:

- `npm run dev` - run backend and frontend together
- `npm run dev:server` - run backend only
- `npm run dev:client` - run frontend only
- `npm run build` - build frontend bundle
- `npm run start` - start production backend entrypoint

## API Surface (High-Level)

TokenFlow exposes modular APIs under `/api`, including:

- `/api/workflows` for workflow upload, execution, and lifecycle actions
- `/api/tokens` for token audit and chain inspection
- `/api/fairness` for dataset audit, mitigation, and reports
- `/api/enterprise` for combined workflow + fairness audits
- `/api/dashboard`, `/api/llm`, `/api/redteam`, `/api/replay`, `/api/report`

Health check:

- `GET /api/health`

## Deployment

### Frontend on Vercel, Backend on Render

Frontend (`Vercel`):

- Framework: Vite
- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_BASE_URL` to your Render backend URL

Backend (`Render`):

- Use `render.yaml` blueprint or manual Web Service setup
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Ensure production env vars are configured from `.env.example`
- Set `FRONTEND_ORIGIN` to your Vercel domain

## Security and Governance Notes

- TokenFlow is built around least-privilege, step-scoped authorization.
- Production deployment should explicitly configure CORS origins and auth secrets.
- Keep `USE_AUTH0`, AI provider keys, and fairness gate mode aligned with environment goals.
- Rotate secrets before any public demo or submission.

## Documentation

- `USER_GUIDE.md` for product usage walkthrough
- `.env.example` for complete configuration reference

## License

This project is licensed under the MIT License.
