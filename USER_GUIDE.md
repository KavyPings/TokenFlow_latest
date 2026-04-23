# TokenFlow User Guide (Plain Language)

This guide explains what each feature does, when to use it, and what inputs are required.

## What This Version Includes

This guide is updated for the current build, including:

- Fairness upload and schema mapping flow (CSV/JSON)
- Deterministic fairness analysis and violation queue
- Threshold-based mitigation with impacted-case tracking
- Deterministic execution gate behavior (`shadow` and `enforce`)
- Mission workflow blocking behavior when gate is in enforce mode

## What TokenFlow Is

TokenFlow is a safety platform for AI workflows.  
It helps teams:

- Run agent workflows with strict token-based controls
- Detect security misuse (like unauthorized data access)
- Review and approve risky actions
- Upload custom workflows
- Audit model fairness on real datasets
- Reduce unfair outcomes with deterministic mitigation

## Main Navigation and What Each Tab Does

### 1) Home
A landing page introducing TokenFlow, explaining the Google Vertex "Double Agent" incident it isolates, and providing direct access to Run/Monitor/Governance flows.

### 2) Run
The core execution environment. This tab consolidates operational execution into three sub-tabs:
- **Launch:** Pick pre-built test scenarios (e.g., normal safe processing, double agent attacks) or select your own uploaded custom workflows to execute. Automatically takes you to the Token Chain once started.
- **Token Chain:** Visually track step-by-step token execution. Watch capability tokens undergo their "mint -> active -> burned" lifecycle. See detailed event logs and trigger the "Kill Switch" to halt rogue workflows instantly.
- **Testbench:** Run comprehensive security scenarios, verify 12 strict invariant assertions, and upload your own custom JSON workflow templates for testing.

### 3) Monitor
The monitoring and intervention area for live operations. It includes:
- **Overview:** Mission Control stats hub with active workflows, intercepts, and live activity.
- **Security:** Human review panel for intercepted (flagged) workflows.

In Security, you can:
- Inspect exactly why a workflow was blocked or paused.
- Review attempted service, resource, and action scope details.
- Override and resume a paused workflow, or safely discard it by revoking tokens.
- Review the historically immutable audit trail.

### 4) Governance
Governance combines Fairness and Score views so policy and outcomes are reviewed together.

In Fairness, you can:
- Audit datasets for structural bias and apply threshold mitigations.
- Upload CSV or JSON dataset files and configure schema mapping.
- Analyze rigorous fairness metrics (Disparate Impact, Equal Opportunity, etc.) across protected groups.
- Generate **Gemini AI-powered Executive Reports** that summarize disparate data points in a plain, human-readable narrative summary (Requires API Key).
- Run deterministic threshold-based mitigation, tracking exactly which, and how many, cases were impacted.

In Score, you can:
- Check your current system's aggregated Security and Fairness Compliance Score.
- View a granular checklist detailing passed/failed requirements across configuration, invariants, and audits.

### 5) About
Explains the real-world Google Vertex AI incident model and helps you visualize and compare a vulnerable architecture against TokenFlow's exact capabilities.

## Secondary Pages You Can Reach From Actions

### Audit Log

Shows immutable token lifecycle events (mint, activate, burn, flag, revoke) with actor and time.

### Vault

Shows credential metadata and status only (never raw secrets).  
Credentials are accessed through backend vault proxy, not directly by agents.

---

## Custom Workflow Upload Format Requirements

To run a custom workflow, go to **Run > Testbench > Upload Custom**. TokenFlow accepts `.json` files that follow a strict schema to map exactly to the capability token engine.

### Required JSON Schema

Your uploaded JSON file must strictly match this structure:

```json
{
  "name": "Sample Data Pipeline",
  "description": "Reads raw data, processes it, and writes the output.",
  "steps": [
    {
      "action": "READ_OBJECT",
      "service": "gcs",
      "resource": "data/input.json",
      "actionVerb": "read"
    },
    {
      "action": "CALL_INTERNAL_API",
      "service": "internal-api",
      "resource": "api/process",
      "actionVerb": "invoke"
    },
    {
      "action": "WRITE_OBJECT",
      "service": "gcs",
      "resource": "output/result.json",
      "actionVerb": "write"
    }
  ]
}
```

### Allowed Values

- **`action`**: Must be one of `READ_OBJECT`, `WRITE_OBJECT`, `CALL_INTERNAL_API`, `ESCALATE_PRIVILEGE`, `MODIFY_PERMISSIONS`.
- **`service`**: Restricted to allowed services like `gcs`, `internal-api`. Use of prohibited services like `source-control` or `internal-repo` will trigger a security isolation block.
- **`actionVerb`**: The verb that requests the token capability (e.g., `read`, `write`, `invoke`).

---

## Fairness Feature: Full Practical Guide

### What the Fairness Module Does

The fairness module checks if model outcomes are uneven across protected groups, then reports violations and optional mitigation impact.

It is deterministic:

- No LLM-based scoring
- Repeatable metric calculations
- Rule-based risk and gate decisions

### Fairness Workflow in Simple Steps

1. Upload dataset file (CSV or JSON)
2. Configure schema mappings
3. Define at least one protected attribute + reference group
4. Run analysis
5. Review violations and risk
6. Run mitigation (only if required inputs exist)
7. Verify after-mitigation deltas and impacted records

---

## Dataset Requirements Before Analysis

### Allowed File Types & Limits

- **Formats:** `.csv` or `.json`
- **Max file size:** 50 MB
- **Max rows:** 1,000,000

### Format Examples

**1. CSV Profile Example**
Your CSV must have a header row. Example:
```csv
id,gender,age_group,income,actual_label,predicted_label,predicted_score,timestamp,model_version
1001,Female,20-30,55000,1,1,0.85,2026-04-21T10:00:00Z,v1.2
1002,Male,30-40,75000,0,1,0.55,2026-04-21T10:05:00Z,v1.2
1003,Female,30-40,65000,1,0,0.42,2026-04-21T10:10:00Z,v1.2
```

**2. JSON Profile Example**
Your JSON must be a top-level array of row objects (or an object wrapping an array). Example:
```json
[
  {
    "id": 1001,
    "gender": "Female",
    "actual_label": 1,
    "predicted_label": 1,
    "predicted_score": 0.85,
    "timestamp": "2026-04-21T10:00:00Z"
  },
  {
    "id": 1002,
    "gender": "Male",
    "actual_label": 0,
    "predicted_label": 1,
    "predicted_score": 0.55,
    "timestamp": "2026-04-21T10:05:00Z"
  }
]
```

### Required Mapped Columns

When you upload the file, the UI will ask you to map your columns to the following required fields:

- `record_id` (e.g., 'id')
- `target_outcome` (e.g., 'actual_label')
- `predicted_outcome` (e.g., 'predicted_label')
- `timestamp`
- `model_version` (optional fallback to "v1.0" if missing in the dataset)

### Required Data Rules

- **Binary Labels:** `target_outcome` and `predicted_outcome` must be exactly two possible values indicating success/failure. For example: `0/1`, `true/false`, or `yes/no` (case-insensitive).
- **No missing values:** Ensure `record_id`, `target_outcome`, and `predicted_outcome` do not contain nulls or empty strings.
- **Groups:** Each protected attribute you configure must contain at least 2 distinct observed groups (e.g., Male/Female, under30/over30).
- **Minimum config:** You must provide at least 1 protected attribute before clicking "Run Analysis".

---

## Additional Requirements Before Mitigation

Mitigation has stricter requirements than analysis.

### Required for Mitigation (must all be true)

- Dataset status must already be `analyzed`
- `predicted_score` must be present in `column_mappings`
- The mapped `predicted_score` column must exist in the dataset
- Score values should be numeric probabilities (typically 0 to 1)
- Protected attributes and reference groups must already be valid
- At least one analyzed fairness report must already exist for that dataset

### Why this is required

Mitigation uses threshold adjustment on score values.  
Without a valid score column, there is no threshold to move, so mitigation cannot run.

### Exact Error You Saw and Meaning

If you get:

`Mitigation requires a predicted_score column. Add predicted_score to column_mappings.`

It means analysis can run, but mitigation is blocked because fairness mitigation depends on per-row scores.

---

## Review Queue and Gate Interaction

Fairness review items have status values like:

- `open`
- `acknowledged`
- `resolved`
- `dismissed`

High-severity items that remain `open` or `acknowledged` can keep the fairness gate in `BLOCK`.

---

## When Workflow Start Gets Blocked

If fairness gate mode is `enforce`, mission workflow start can be blocked when:

- A latest analyzed fairness report is `high` risk, or
- Unresolved high-severity fairness review items exist

In that case, backend responds with:

- Error code: `FAIRNESS_GATE_BLOCKED`
- HTTP status: `423 Locked`

If mode is `shadow`, the block decision is still calculated and logged, but mission workflows continue.

Testbench workflows are not blocked by fairness gate.

---

## Common Fairness Errors and Quick Fixes

### `INVALID_FILE`

Cause:

- Unsupported extension, bad JSON format, or invalid row structure

Fix:

- Use `.csv` or `.json`
- Ensure JSON rows are objects, not plain values
- If wrapped JSON is used, ensure one key contains an array of row objects

### `SCHEMA_MISMATCH`

Cause:

- Required mapped column missing or protected column missing

Fix:

- Verify mapping names exactly match dataset headers (case-sensitive)

### Binary label errors on target/predicted columns

Cause:

- Labels include non-binary values

Fix:

- Normalize labels to binary values (`0/1`, `true/false`, `yes/no`)

### Protected attribute group error

Cause:

- Attribute has only one observed group in uploaded data

Fix:

- Use a dataset with at least two groups for each protected attribute

### Mitigation score error

Cause:

- Missing `predicted_score` mapping or non-usable score values

Fix:

- Add `predicted_score` in schema mapping and re-upload (or re-map) dataset

---

## Suggested Dataset Header Template (Fairness)

Use this as a practical baseline:

- `id`
- `actual_label`
- `predicted_label`
- `predicted_score`
- `timestamp`
- `model_version`
- `gender` (or another protected attribute)

Then map:

- `record_id -> id`
- `target_outcome -> actual_label`
- `predicted_outcome -> predicted_label`
- `predicted_score -> predicted_score`
- `timestamp -> timestamp`
- `model_version -> model_version`

---

## Fairness Gate Behavior (Execution Guardrail)

After analysis/review updates, TokenFlow evaluates fairness gate state:

- `ALLOW` means workflows can proceed
- `BLOCK` means fairness state is unsafe

Mode controls:

- `shadow`: logs block decision but does not stop mission workflow start
- `enforce`: actively blocks mission workflow start

This gate does not block testbench workflows.

---

## Local Dev Environment Note

If you run locally with Vite + Node:

- Keep `VITE_API_BASE_URL` empty for local proxy mode
- Vite proxies `/api` and `/ws` to backend
- Missing `.env` can still work in local mode because code has defaults (port, DB path, mock auth behavior)
