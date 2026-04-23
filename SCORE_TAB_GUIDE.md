# Score Tab Guide

## What the Score Tab does

The Score tab (inside Dataset Management) is a live dataset-governance scorecard.

Important: workflow execution health is now shown in Workflow Management > Workflow Score.

Dataset Score focuses on fairness and dataset-governance evidence instead of workflow token-chain execution.

The screen shows:
- A composite dataset governance score and grade
- Score breakdown by category
- Compliance checklist with pass/fail items
- Summary stats (datasets, violations, review queue, gate status)
- PDF export of the current audit snapshot

## How the score is computed

The dataset score is weighted from 4 parts:
- Dataset Coverage: 30%
- Fairness Health: 30%
- Review Queue Hygiene: 20%
- Mitigation Readiness: 20%

In simple terms:
- Better dataset coverage raises the score
- Fewer severe unresolved violations raises the score
- Lower pending review backlog raises the score
- More mitigation-ready datasets raises the score

## Where data comes from

When Score loads (or when Recalculate is clicked), it fetches:
- Fairness datasets
- Fairness review queue
- Fairness execution gate status

This means the Score reflects current backend state, not hardcoded values.

## How to see it live in action

Follow this sequence to watch Dataset Score change in a meaningful way.

### 1) Start the app
- Run the project normally (same local run steps in README).

### 2) Reset to a clean baseline
- Click Reset Demo in the top bar.
- This gives you a predictable starting point.

### 3) Generate positive signal
- Go to Dataset Management > Fairness.
- Upload a clean dataset and run analysis.
- This should improve dataset coverage and fairness health metrics.

### 4) Generate security signal
- Use a dataset likely to produce violations.
- Run analysis and leave some findings unresolved.
- This increases pending/severity pressure and lowers score components.

### 5) Generate testbench signal
- Resolve or dismiss items in the fairness review queue.
- Recalculate and observe queue hygiene improve.

### 6) Generate governance signal
- Open Dataset Management > Fairness.
- Run fairness analysis on a dataset (sample dataset works).
- This updates fairness gate conditions used by Score.

### 7) Inspect score update
- Open Dataset Management > Score.
- Click Recalculate.
- Compare:
  - Arc gauge value and grade
  - Score Breakdown rows
  - Compliance Checklist pass count

## Quick interpretation guide

- High score means strong dataset-governance posture across fairness + queue handling + mitigation readiness.
- Mid score usually means one area is lagging (often pending queue or low mitigation readiness).
- Low score usually means datasets are under-tested or severe issues remain unresolved.

## Troubleshooting if score does not change

- Ensure at least one dataset has been analyzed.
- Ensure review queue state has changed between recalculations.
- Ensure fairness analysis has been executed at least once.
- Click Recalculate after each major action.
- If API calls fail, refresh and check server health.
