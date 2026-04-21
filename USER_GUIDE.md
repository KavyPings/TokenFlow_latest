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

### 1) About

Use this tab to understand the problem TokenFlow solves and how the system works at a high level.

### 2) Dashboard

Use this tab as your control center. You can:

- See current workflow health
- See token activity and security pressure
- Jump to active chain, security review, or launch
- Trigger kill switch for current active workflow

### 3) Token Chain

Use this tab to inspect step-by-step execution. You can:

- See token lifecycle (mint -> active -> burned/flagged/revoked)
- View timeline and event stream
- Track progress through workflow phases
- Use kill switch
- Clear settled workflows from view

### 4) Security

Use this tab for human review of flagged workflows. You can:

- Inspect intercepted workflows and violation reasons
- Review attempted service/resource/action details
- Override and resume a paused workflow
- Revoke and abort a risky workflow
- View historical workflow audit details
- Clear audit log entries from the UI context

### 5) Testbench

Use this tab to run predefined security scenarios and invariant checks. You can:

- Run one scenario or full suite
- Test safe, attack, and control scenarios
- See pass/fail assertions with expected vs actual values
- Run uploaded workflows through the same test framework

### 6) Upload

Use this tab to upload custom workflow JSON files. You can:

- Start from templates
- Paste/edit JSON directly
- Validate before running
- Keep invalid uploads for debugging
- Run or delete uploaded workflows

### 7) Fairness

Use this tab to audit datasets for bias and apply mitigation. You can:

- Upload CSV/JSON dataset files
- Map business columns to fairness fields
- Analyze fairness metrics by protected groups
- Review violations and risk level
- Run threshold-based mitigation
- Track impacted records and threshold deltas
- View immutable fairness audit trail
- Monitor fairness execution gate status

Fairness UI tabs are:

- Upload and Configure
- Analysis Results
- Mitigation
- Review Queue
- Audit Trail

### 8) Mock Launch

Use this tab to start a mock execution scenario quickly.  
Scenarios include safe runs, attack attempts, and control behaviors.

### 9) Incident

Use this tab to explain the real-world incident model and compare vulnerable architecture vs TokenFlow controls.

## Secondary Pages You Can Reach From Actions

### Audit Log

Shows immutable token lifecycle events (mint, activate, burn, flag, revoke) with actor and time.

### Vault

Shows credential metadata and status only (never raw secrets).  
Credentials are accessed through backend vault proxy, not directly by agents.

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

### Allowed File Types

- `.csv`
- `.json`

### File Limits

- Max upload size: 50 MB
- Max row count: 1,000,000

### JSON Shape Accepted

Your JSON can be:

- A top-level array of row objects
- Or an object that contains one row array (for example `data`, `rows`, `records`, `items`, or `results`)

### Required Mapped Columns

You must map these fields:

- `record_id`
- `target_outcome`
- `predicted_outcome`
- `timestamp`
- `model_version`

### Required Data Rules

- `target_outcome` and `predicted_outcome` must be binary-like values only:
  - `0/1`, `true/false`, `yes/no` (case-insensitive)
- No null/empty values in:
  - `record_id`, `target_outcome`, `predicted_outcome`
- Each protected attribute must have at least 2 observed groups
- You must provide at least 1 protected attribute in config

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
