# TokenFlow OS

**TokenFlow** is a comprehensive, open-source operating system designed to secure and monitor AI-driven automated decision workflows. Inspired by the need for zero-trust security in systems capable of autonomous execution, TokenFlow acts as an interception layer between AI intent and execution.

TokenFlow introduces a strict, token-gated execution engine that validates every step of a workflow. Coupled with a powerful fairness audit platform, TokenFlow not only prevents malicious actions (like scope escalation or unauthorized retrieval) but also mitigates demographic bias in the automated decisions themselves.

## Features & Architecture

### 🛡️ Token-Gated Security Engine
- **Step-by-Step Authorization:** Rather than giving an AI agent blanket access to a database or API, TokenFlow issues cryptographic, single-use tokens scoped strictly to specific actions, services, and resources. 
- **The Token Chain:** Creates an immutable, visual ledger. You can trace every consumed token (green), minted but unused token (blue), or blocked/flagged token (red).
- **Incident Interception:** Automatically halts execution if an agent attempts replay attacks, scope escalation, or accesses unauthorized services, placing the workflow in a quarantine "Review Queue".

### ⚖️ Fairness & Compliance Engine
- **Bias Detection Matrix:** A dedicated calculation engine to detect demographic bias in decision-making models. Calculates enterprise-grade statistics:
  - Statistical Parity Difference (SPD)
  - Disparate Impact Ratio (DIR)
  - Equal Opportunity Difference (EOD)
  - Average Odds Difference (AOD)
- **Threshold Mitigation Adjustment:** Features built-in mitigation logic that rectifies biased datasets by adjusting approval thresholds based on demographic group.
- **Dynamic Grading System:** Calculates a robust Compliance Score based on test coverage, overall assessed risk levels, and operational queue health.

### 🧠 Gemini AI Reporting
- Integrates with the **Gemini AI SDK** to generate executive-level narrative reports. Rather than drowning users in complex statistical matrices, the system generates plain-English contextual explanations of workflow biases.

### 🏢 Enterprise Extensibility
- **Custom Workflow Uploads:** Beyond our standard mock execution scenarios, the system safely ingests, validates, and runs custom JSON workflow definitions through the token-chain.
- **Enterprise Combined Audits:** Allows organizations to upload a dataset and workflow mapping synchronously to lock down both the data pipeline and the operational scope in a single cryptographic report.

---

## Technology Stack

TokenFlow leverages an entirely local, deterministic backend ensuring strict state retention.

- **Frontend:** React + Vite, Framer Motion for visualizations, Vanilla CSS (Tokenized Surface Container System)
- **Backend:** Node.js, Express.js
- **Real-time Event Bridge:** WebSockets (ws)
- **Database:** `better-sqlite3` (Local file-based system `tokenflow.db`)
- **Validation:** Zod schemas
- **AI Integrations:** `@google/genai`

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/TokenFlow.git
   cd TokenFlow
   ```

2. **Environment Variables:**
   Create a `.env` file in the `server/` directory and structure it as found in `.env.example`:
   ```bash
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=10000
   ```

3. **Install Dependencies:**
   TokenFlow uses a standard Node setup. You'll need to install dependencies for both the frontend and backend.
   *(We recommend running split terminals for development).*
   
   **Frontend:**
   ```bash
   cd client
   npm install
   npm run dev
   ```

   **Backend:**
   ```bash
   cd server
   npm install
   npm run dev
   ```

---

## Deployment Ready

TokenFlow includes both `vercel.json` (for the React Client) and `render.yaml` (for the Node Backend Service) configurations to allow for immediate deployment.

1. **Backend (Render):** The backend binds strictly to `0.0.0.0` to permit Render’s proxying, and enables WebSocket traffic dynamically. It utilizes a persistent disk volume to ensure that the SQLite database (`tokenflow.db`) and user uploads are preserved across instance restarts.
2. **Frontend (Vercel):** All frontend API and WebSocket calls use deterministic paths targeting your deployed backend URL.

To deploy in production, replace the connection references in `client/src/services/api.js` with your production API URL, or set your environment variables accordingly.

---

## License

This project is licensed under the MIT License.
