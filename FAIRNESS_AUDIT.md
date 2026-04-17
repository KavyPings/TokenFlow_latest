# Fairness Audit System

A built-in tool for detecting bias in AI model predictions. Upload a dataset, click analyze, and instantly see which groups are being treated unfairly.

---

## How to Use (Step by Step)

### Step 1: Open the Fairness Page

1. Start the app: `npm run dev`
2. Open `http://localhost:5173` in your browser
3. Click **"FAIRNESS"** in the top navigation bar

You'll see the Fairness Audit page with 4 tabs:
- **Upload & Configure** — upload your data
- **Analysis Results** — see the bias report
- **Review Queue** — manage flagged violations
- **Audit Trail** — see the history of actions

---

### Step 2: Prepare Your Dataset

Your dataset should be a **CSV** or **JSON** file with these columns:

| Column | What it is | Example values |
|--------|-----------|----------------|
| **ID column** | Unique identifier for each row | `1`, `2`, `3`… |
| **Actual outcome** | What actually happened (0 or 1) | `1` = qualified, `0` = not qualified |
| **Predicted outcome** | What the model predicted (0 or 1) | `1` = approved, `0` = denied |
| **Timestamp** | When the prediction was made | `2024-01-15` |
| **Model version** | Which model made the prediction | `v1`, `v2` |
| **Protected attribute(s)** | Sensitive demographics to check for bias | `male`/`female`, `white`/`black`/`asian` |
| **Predicted score** (optional) | Model confidence 0–1 | `0.87` |

#### Example CSV file:

```csv
id,gender,race,actual,predicted,score,date,model
1,male,white,1,1,0.91,2024-01-01,v2
2,female,black,1,0,0.42,2024-01-01,v2
3,male,asian,0,0,0.15,2024-01-02,v2
4,female,white,1,1,0.88,2024-01-02,v2
```

---

### Step 3: Upload Your Dataset

1. Click the **"Upload & Configure"** tab
2. Click the upload area and select your CSV/JSON file
3. You'll see a **preview** of the first 5 rows — verify the data looks correct

---

### Step 4: Configure the Schema

After uploading, fill in the form fields:

1. **Dataset Name** — Give it a descriptive name (e.g., "Q1 2024 Hiring Decisions")
2. **Column Mappings** — Tell the system which column is which:
   - **Record ID** → your ID column (e.g., `id`)
   - **Target Outcome** → the actual/true label column (e.g., `actual`)
   - **Predicted Outcome** → the model's prediction column (e.g., `predicted`)
   - **Timestamp** → date column (e.g., `date`)
   - **Model Version** → version column (e.g., `model`)
   - **Predicted Score** → confidence score column, optional (e.g., `score`)

> **Tip:** The system auto-detects common column names like `id`, `actual`, `predicted`, `score`, etc.

3. **Protected Attributes** — Define which demographic columns to check for bias:
   - **Column** → e.g., `gender`
   - **Reference Group** → the majority/baseline group, e.g., `male`
   - Click **"Add Attribute"** to check multiple demographics (e.g., both gender and race)

4. Click **"Upload & Profile Dataset"**

---

### Step 5: Run the Analysis

1. After upload, you'll be switched to the **"Analysis Results"** tab
2. Your dataset appears in the **left sidebar**
3. Click **"Run Analysis"** in the sidebar panel
4. Wait a few seconds — the system computes all fairness metrics

---

### Step 6: Read the Results

The analysis page shows:

#### Risk Banner
A colored banner at the top showing the overall risk level:
- 🟢 **LOW** — No significant fairness issues
- 🟡 **MEDIUM** — Some metrics are borderline
- 🔴 **HIGH** — Significant bias detected, immediate review needed

#### Group Metrics Table
Shows per-group performance:
- **Selection Rate** — What % of each group got approved
- **TPR** (True Positive Rate) — How well the model identifies qualified people in each group
- **FPR** (False Positive Rate) — How often unqualified people are mistakenly approved

#### Fairness Metrics Table
Shows cross-group comparisons:
- **Statistical Parity Difference** — Difference in approval rates (should be close to 0)
- **Disparate Impact Ratio** — Ratio of approval rates (should be between 0.8 and 1.25, per the "four-fifths rule")
- **Equal Opportunity Difference** — Difference in true positive rates (should be close to 0)
- **Average Odds Difference** — Average of TPR and FPR differences (should be close to 0)

**Red values = violation detected.** Green values = within acceptable range.

#### Violations List
Each flagged violation shows:
- Which metric was violated
- Which group is affected
- The severity (HIGH/MEDIUM)
- What the actual value was

---

### Step 7: Review Violations

1. Click the **"Review Queue"** tab
2. Each violation can be:
   - **Acknowledged** — "We see this, we're investigating"
   - **Resolved** — "We've fixed the underlying issue"
   - **Dismissed** — "This is acceptable for our use case"

---

### Step 8: Check the Audit Trail

Click the **"Audit Trail"** tab to see a timeline of every action:
- When the dataset was uploaded
- When the analysis was run
- When violations were reviewed
- Who performed each action

This is an **immutable log** — nothing can be deleted, which is important for compliance.

---

## What the Metrics Mean (Plain English)

| Metric | What it measures | Fair value | Example of unfairness |
|--------|-----------------|------------|----------------------|
| **Statistical Parity** | Do all groups get approved at the same rate? | ±0.1 | Men approved 80%, women only 50% |
| **Disparate Impact** | Is the approval ratio between groups fair? | 0.8–1.25 | Female rate / male rate = 0.625 (below 0.8) |
| **Equal Opportunity** | Among qualified people, are all groups approved equally? | ±0.1 | 90% of qualified men approved, but only 60% of qualified women |
| **Average Odds** | Combining TPR and FPR differences | ±0.1 | Overall prediction accuracy differs by group |

---

## Quick Test (Try It Now)

To test the system immediately, create a file called `test_data.csv` with this content:

```csv
id,gender,actual,predicted,score,date,model
1,male,1,1,0.95,2024-01-01,v1
2,male,1,1,0.88,2024-01-01,v1
3,male,0,0,0.12,2024-01-01,v1
4,male,1,1,0.91,2024-01-01,v1
5,male,0,0,0.08,2024-01-01,v1
6,female,1,0,0.42,2024-01-01,v1
7,female,1,0,0.38,2024-01-01,v1
8,female,0,0,0.15,2024-01-01,v1
9,female,1,1,0.78,2024-01-01,v1
10,female,1,0,0.35,2024-01-01,v1
```

Then:
1. Go to **Fairness** → **Upload & Configure**
2. Upload `test_data.csv`
3. Set: Record ID = `id`, Target = `actual`, Predicted = `predicted`, Timestamp = `date`, Model = `model`
4. Protected Attribute: Column = `gender`, Reference Group = `male`
5. Click **Upload & Profile**, then **Run Analysis**

You should see: men are approved at 100% of qualified applicants, women only 33% → **HIGH risk, disparate impact violation**.

---

## REST API Reference

All endpoints are under `/api/fairness/`. These are used by the frontend automatically, but you can also call them directly.

### Upload a dataset
```
POST /api/fairness/upload
Content-Type: multipart/form-data

Form fields:
  file: <your CSV or JSON file>
  config: <JSON string with settings>
```

### List datasets
```
GET /api/fairness/datasets
```

### Get dataset details
```
GET /api/fairness/datasets/:id
```

### Run analysis
```
POST /api/fairness/datasets/:id/analyze
```

### Get report
```
GET /api/fairness/datasets/:id/report
```

### Get audit trail
```
GET /api/fairness/datasets/:id/audit-trail
```

### Get review queue
```
GET /api/fairness/review-queue?dataset_id=<id>
```

### Update review item
```
PATCH /api/fairness/review-queue/:itemId
Body: { "status": "acknowledged|resolved|dismissed", "reviewer": "name" }
```

---

## Architecture

```
server/src/fairness/
├── services/
│   ├── fairnessMetrics.js   ← Computes all metrics (pure math, no AI)
│   ├── datasetProfiler.js   ← Statistical summary of datasets
│   └── auditService.js      ← Audit log, reports, review queue
└── utils/
    ├── csvParser.js          ← Parses CSV files
    ├── validation.js         ← Validates config and schema
    └── mathHelpers.js        ← Math functions (confusion matrix, etc.)

server/src/routes/
└── fairnessRoutes.js         ← All 8 REST endpoints

client/src/pages/
└── FairnessPage.jsx          ← Frontend UI
```

All metrics are **deterministic** — same input always produces the same output. No LLMs or AI services are used for computation.
