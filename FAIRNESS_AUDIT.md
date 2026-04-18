# Fairness Audit System — Technical Documentation

## Overview

TokenFlow OS includes a **deterministic fairness auditing system** that detects bias in model predictions, computes canonical fairness metrics, provides automated mitigation via threshold adjustment, and enforces a **non-configurable execution gate** that blocks mission-critical workflow launches when fairness state is unsafe.

Everything runs in pure JavaScript — **no LLMs, no external AI services, no probabilistic components**.

---

## Architecture

```
Client (React)                Backend (Node.js / Express)
┌────────────────┐            ┌────────────────────────────────┐
│  FairnessPage  │───upload──▷│  fairnessRoutes.js             │
│   • Upload     │            │    ├─ validation.js             │
│   • Results    │            │    ├─ csvParser.js               │
│   • Mitigation │            │    ├─ datasetProfiler.js         │
│   • Review     │            │    ├─ fairnessMetrics.js         │
│   • Audit      │            │    ├─ auditService.js            │
│   • Gate Status│            │    ├─ mitigationService.js       │
│                │            │    └─ executionGateService.js     │
└────────────────┘            └────────────────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │   SQLite DB      │
                              │ • fairness_*     │
                              │ • audit triggers │
                              └─────────────────┘
```

---

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `fairness_datasets` | Uploaded datasets with config, profile, and raw data blob |
| `fairness_audit_logs` | **Immutable** audit trail (enforced by DB triggers) |
| `fairness_reports` | Generated fairness analysis reports |
| `fairness_review_queue` | Flagged violations with severity, policy_level, and review status |
| `fairness_mitigation_reports` | Threshold adjustment results with before/after metrics |
| `fairness_impacted_cases` | Row-level records affected by mitigation |
| `fairness_gate_decisions` | Operational log of every gate evaluation |

### Immutability

SQLite triggers prevent `UPDATE` and `DELETE` on `fairness_audit_logs`:

```sql
CREATE TRIGGER prevent_audit_log_update
  BEFORE UPDATE ON fairness_audit_logs
  BEGIN SELECT RAISE(ABORT, 'Fairness audit logs are immutable'); END;

CREATE TRIGGER prevent_audit_log_delete
  BEFORE DELETE ON fairness_audit_logs
  BEGIN SELECT RAISE(ABORT, 'Fairness audit logs are immutable'); END;
```

---

## API Endpoints

### Dataset Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/fairness/upload` | Upload dataset (multipart) with config |
| `GET` | `/api/fairness/datasets` | List all datasets |
| `GET` | `/api/fairness/datasets/:id` | Get dataset details + profile |

### Analysis & Reporting

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/fairness/datasets/:id/analyze` | Compute fairness metrics, generate report, evaluate gate |
| `GET` | `/api/fairness/datasets/:id/report` | Get latest report |
| `GET` | `/api/fairness/datasets/:id/audit-trail` | Get audit history |

### Mitigation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/fairness/datasets/:id/mitigate` | Run threshold adjustment mitigation |
| `GET` | `/api/fairness/datasets/:id/mitigation-report` | Get latest mitigation report |
| `GET` | `/api/fairness/datasets/:id/impacted-cases` | Get row-level impacted cases |

### Review Queue

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/fairness/review-queue` | List flagged violations (filterable) |
| `PATCH` | `/api/fairness/review-queue/:id` | Update review item status |

### Execution Gate

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/fairness/execution-gate` | Read-only gate status + metrics |

---

## Data Contracts

### Strict Validation Rules

1. **Binary-only outcomes**: `target_outcome` and `predicted_outcome` columns must contain only `0/1/true/false/yes/no`. Non-binary values are rejected.
2. **No nulls in required columns**: `record_id`, `target_outcome`, `predicted_outcome` must be fully populated. Empty/null values are rejected.
3. **Minimum 2 groups**: Each protected attribute must have at least 2 observed groups for fairness comparison.
4. **Reference group validation**: If the specified reference group is not found in the data, a warning is issued.

### Config Schema

```json
{
  "dataset_name": "string (required, max 255 chars)",
  "column_mappings": {
    "record_id": "string (required)",
    "target_outcome": "string (required)",
    "predicted_outcome": "string (required)",
    "timestamp": "string (required)",
    "model_version": "string (required)",
    "predicted_score": "string (optional, needed for mitigation)"
  },
  "protected_attributes": [
    { "column": "string", "reference_group": "string" }
  ],
  "thresholds": {
    "statistical_parity_difference": 0.1,
    "disparate_impact_ratio_min": 0.8,
    "disparate_impact_ratio_max": 1.25,
    "equal_opportunity_difference": 0.1,
    "average_odds_difference": 0.1
  },
  "zero_division_policy": "null | zero"
}
```

---

## Fairness Metrics

### Per-Group Metrics (computed via streaming aggregate — O(n) per attribute)

| Metric | Formula | Description |
|--------|---------|-------------|
| Selection Rate | `(TP + FP) / N` | Fraction of records predicted positive |
| True Positive Rate | `TP / (TP + FN)` | Recall / Sensitivity |
| False Positive Rate | `FP / (FP + TN)` | Fall-out |
| Confusion Matrix | `TP, FP, TN, FN` | Stored per group for trace/debug |

### Fairness Metrics (cross-group comparison)

| Metric | Formula | Fair Range | Description |
|--------|---------|------------|-------------|
| SPD | `SR(group) - SR(ref)` | `[-0.1, +0.1]` | Statistical Parity Difference |
| DIR | `SR(group) / SR(ref)` | `[0.8, 1.25]` | Disparate Impact Ratio (four-fifths rule) |
| EOD | `TPR(group) - TPR(ref)` | `[-0.1, +0.1]` | Equal Opportunity Difference |
| AOD | `0.5 * ((FPR_g - FPR_r) + (TPR_g - TPR_r))` | `[-0.1, +0.1]` | Average Odds Difference |

### Advanced Metrics

- **Calibration by Group**: Mean predicted score vs actual positive rate per group
- **Representation Skew**: Group proportions vs expected uniform distribution
- **Missingness by Group**: Missing value rates per column per group

### Zero Division Policy

Controlled by `zero_division_policy` in config:
- `"null"` (default): Returns `null` when denominator is 0
- `"zero"`: Returns `0` when denominator is 0

---

## Streaming Aggregate Mode

Group-level confusion matrices are computed in a **single O(n) pass** per attribute using `streamingGroupAggregate`. This avoids storing all rows per group and reduces memory usage:

```javascript
// O(n) per-group TP/FP/TN/FN without per-group row storage
const groupAggs = streamingGroupAggregate(
  rows, keyFn, targetCol, predictedCol, toBinaryFn
);
```

---

## Violation Detection

### Severity Mapping

| Level | Criteria | Policy Level |
|-------|----------|-------------|
| `high` | `|value| > threshold × 2` or DIR < 0.6 or DIR > 1.67 | `block` |
| `medium` | `|value| > threshold` | `warning` |
| `low` | Within threshold | (no violation) |

### Disadvantaged Group Detection

For each metric, the system identifies the **worst-performing group** by computing:
- `worst_group`: Group name with the highest distance from fairness
- `worst_value`: The actual metric value for that group
- `distance_from_ref`: Absolute distance from the reference/ideal value

---

## Execution Gate

### Design Principles

1. **Non-configurable**: Block criteria are hard-coded, not per-run adjustable
2. **Deterministic**: Same database state → same gate decision
3. **Scoped**: Only `mission` workflows are gated; testbench workflows bypass entirely

### Block Criteria

The gate **BLOCKS** when:
1. **Any** latest fairness report has `risk_level = 'high'`, OR
2. **Any** unresolved high-severity review queue item exists (`status IN ('open', 'acknowledged')`)

The gate **ALLOWS** when:
1. All latest reports are `low` or `medium` risk, AND
2. All high-severity queue items are `resolved` or `dismissed`

### Rollout Modes

| Mode | Behavior |
|------|----------|
| `shadow` (default) | Compute gate decision, log it, but **don't block** workflow starts |
| `enforce` | Compute gate decision AND **hard-block** workflow starts if BLOCK |

Set via environment variable: `FAIRNESS_GATE_MODE=shadow|enforce`

### Gate Decision Object

```json
{
  "allowed": true,
  "mode": "shadow",
  "decision": "ALLOW",
  "message": "All fairness checks passed.",
  "blocking_datasets": [],
  "blocking_items": [],
  "evaluated_at": "2026-04-18T...",
  "evaluation_ms": 2.1
}
```

### HTTP 423 Response (Enforce Mode)

When a mission workflow is blocked, the API returns:

```json
HTTP 423 Locked
{
  "error": "FAIRNESS_GATE_BLOCKED",
  "message": "Execution blocked: 1 dataset(s) with HIGH risk level.",
  "gate": { /* full gate decision object */ }
}
```

### Integration Points

1. **Post-analysis**: Gate evaluates automatically after every `POST /analyze`
2. **Post-review-update**: Gate re-evaluates after every `PATCH /review-queue/:id`
3. **Pre-workflow-start**: Gate checks in `workflowRunner.startWorkflow()` for `mission` workflows
4. **Preflight check**: Gate evaluates on `GET /execution-gate` requests

---

## Mitigation Service

### Method: Threshold Adjustment

Uses **fixed-bin score buckets** (B=100) for approximate threshold sweep.

**Complexity**: `O(n + B × G)` per protected attribute, where:
- `n` = total rows
- `B` = number of bins (100)
- `G` = number of groups

### Algorithm

1. Partition rows by group, collect predicted scores into 100 fixed bins
2. Compute the reference group's selection rate as the target
3. For each non-reference group, sweep thresholds (high to low) to find the one that best matches the target selection rate
4. Apply adjusted thresholds, recompute all fairness metrics
5. Store before/after deltas and row-level impacted cases

### Prerequisites

- Dataset must have `predicted_score` column mapped (continuous probability 0–1)
- Dataset must be in `analyzed` status

### Output

```json
{
  "id": "uuid",
  "method": "threshold_adjustment",
  "config": { "num_bins": 100, "group_thresholds": {...} },
  "before_summary": {...},
  "after_summary": {...},
  "deltas": { "per_attribute": {...} },
  "impacted_count": 42
}
```

---

## Audit Trail

Every action is logged as an immutable audit event:

| Action | Trigger |
|--------|---------|
| `upload` | Dataset uploaded |
| `profile` | Dataset profiled |
| `analyze` | Fairness analysis run |
| `analyze_error` | Analysis failed |
| `execution_gate` | Gate evaluated (with decision) |
| `mitigate` | Mitigation run |
| `review_update` | Review queue item updated |

Each event records: `dataset_id`, `action`, `details` (JSON), `config_snapshot`, `metrics_snapshot`, `actor`, `timestamp`.

---

## Frontend (FairnessPage.jsx)

### Tabs

1. **Upload & Configure**: File upload (CSV/JSON), column mapping, protected attribute definition
2. **Analysis Results**: Risk banner, per-group metrics table, fairness metrics, disadvantaged groups, violations with policy badges
3. **Mitigation**: Before/after delta comparison, impacted case count, computed thresholds
4. **Review Queue**: Flagged violations with severity + policy_level badges, acknowledge/resolve/dismiss actions
5. **Audit Trail**: Immutable timeline of all actions with expandable details

### Gate Status Indicator

Displayed in the page header:
- 🟢 `GATE: ALLOW (mode)` — all clear
- 🔴 `GATE: BLOCK (mode)` — high-risk violations detected

Updates automatically after analysis, mitigation, and review actions.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FAIRNESS_GATE_MODE` | `shadow` | Gate enforcement mode (`shadow` or `enforce`) |
| `FAIRNESS_THRESHOLD` | `0.20` | Legacy threshold (superseded by per-metric thresholds in config) |

---

## File Structure

```
server/src/fairness/
├── services/
│   ├── fairnessMetrics.js      # Deterministic metrics engine (streaming aggregate)
│   ├── datasetProfiler.js      # O(n) dataset profiling
│   ├── auditService.js         # Audit trail, report generation, review queue
│   ├── executionGateService.js # Central gate evaluator (non-configurable)
│   └── mitigationService.js    # Threshold adjustment mitigation
└── utils/
    ├── validation.js           # Strict input validation (binary, nulls, groups)
    ├── csvParser.js            # CSV parsing with quoted field support
    └── mathHelpers.js          # Pure math (safeDiv, confusionMatrix, streaming aggregate)

server/src/routes/
└── fairnessRoutes.js           # REST API (12 endpoints)

server/src/engine/
└── workflowRunner.js           # Gate enforcement for mission workflows

client/src/pages/
└── FairnessPage.jsx            # Full UI (5 tabs + gate indicator)
```

---

## Security Considerations

1. **Audit immutability**: SQLite triggers prevent tampering with the audit log
2. **Input sanitization**: All user-provided strings are sanitized to remove control characters
3. **File size limits**: 50MB max upload, 1M max rows
4. **Gate non-configurability**: Block criteria cannot be overridden at runtime
5. **Scoped enforcement**: Only mission workflows are gated; testbench is unaffected
