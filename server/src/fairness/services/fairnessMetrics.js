// ═══════════════════════════════════════════════════════════
// Fairness Metrics Service — Deterministic, mathematically
// correct fairness metric computation.
//
// ALL metrics are computed in pure JavaScript.
// NO LLMs, NO external AI services.
// ═══════════════════════════════════════════════════════════

import {
  safeDiv,
  safeDivPolicy,
  confusionMatrix,
  groupBy,
  streamingGroupAggregate,
  countMissing,
  round,
  mean,
} from '../utils/mathHelpers.js';

// ───────────────────────────────────────────────────────────
// GROUP-LEVEL METRICS
// ───────────────────────────────────────────────────────────

/**
 * Compute selection rate for a group of records.
 * selection_rate = count(predicted == positive) / total
 *
 * @param {object[]} rows - Records in this group
 * @param {string} predictedCol - Column name for predicted outcome
 * @returns {number|null}
 */
export function selectionRate(rows, predictedCol) {
  if (!rows || rows.length === 0) return null;
  let positive = 0;
  for (const row of rows) {
    if (toBinary(row[predictedCol]) === 1) positive++;
  }
  return safeDiv(positive, rows.length);
}

/**
 * Compute True Positive Rate (TPR / Recall / Sensitivity) for a group.
 * TPR = TP / (TP + FN)
 *
 * @param {object[]} rows
 * @param {string} targetCol
 * @param {string} predictedCol
 * @returns {number|null}
 */
export function truePositiveRate(rows, targetCol, predictedCol) {
  if (!rows || rows.length === 0) return null;
  const actual = rows.map((r) => toBinary(r[targetCol]));
  const predicted = rows.map((r) => toBinary(r[predictedCol]));
  const cm = confusionMatrix(actual, predicted);
  return safeDiv(cm.tp, cm.tp + cm.fn);
}

/**
 * Compute False Positive Rate (FPR / Fall-out) for a group.
 * FPR = FP / (FP + TN)
 *
 * @param {object[]} rows
 * @param {string} targetCol
 * @param {string} predictedCol
 * @returns {number|null}
 */
export function falsePositiveRate(rows, targetCol, predictedCol) {
  if (!rows || rows.length === 0) return null;
  const actual = rows.map((r) => toBinary(r[targetCol]));
  const predicted = rows.map((r) => toBinary(r[predictedCol]));
  const cm = confusionMatrix(actual, predicted);
  return safeDiv(cm.fp, cm.fp + cm.tn);
}

/**
 * Compute group metrics from pre-aggregated confusion matrix stats.
 * Used by the streaming aggregate path.
 *
 * @param {{ tp: number, fp: number, tn: number, fn: number, count: number, positives: number }} agg
 * @param {string} zdPolicy - zero_division_policy: 'null' or 'zero'
 * @returns {object}
 */
function computeGroupMetricsFromAggregate(agg, zdPolicy = 'null') {
  const divFn = (n, d) => safeDivPolicy(n, d, zdPolicy);
  return {
    count: agg.count,
    selection_rate: round(divFn(agg.tp + agg.fp, agg.count)),
    true_positive_rate: round(divFn(agg.tp, agg.tp + agg.fn)),
    false_positive_rate: round(divFn(agg.fp, agg.fp + agg.tn)),
    confusion_matrix: {
      true_positives: agg.tp,
      false_positives: agg.fp,
      true_negatives: agg.tn,
      false_negatives: agg.fn,
    },
  };
}

// ───────────────────────────────────────────────────────────
// FAIRNESS METRICS (cross-group comparisons)
// ───────────────────────────────────────────────────────────

/**
 * Statistical Parity Difference
 * SPD = selection_rate(group) - selection_rate(reference)
 * Fair range: [-threshold, +threshold], typically [-0.1, 0.1]
 *
 * @param {number|null} groupRate
 * @param {number|null} referenceRate
 * @returns {number|null}
 */
export function statisticalParityDifference(groupRate, referenceRate) {
  if (groupRate === null || referenceRate === null) return null;
  return round(groupRate - referenceRate);
}

/**
 * Disparate Impact Ratio
 * DIR = selection_rate(group) / selection_rate(reference)
 * Fair range: [0.8, 1.25] (the "four-fifths rule")
 *
 * @param {number|null} groupRate
 * @param {number|null} referenceRate
 * @returns {number|null}
 */
export function disparateImpactRatio(groupRate, referenceRate) {
  if (groupRate === null || referenceRate === null) return null;
  return round(safeDiv(groupRate, referenceRate));
}

/**
 * Equal Opportunity Difference
 * EOD = TPR(group) - TPR(reference)
 * Fair range: [-threshold, +threshold]
 *
 * @param {number|null} groupTPR
 * @param {number|null} referenceTPR
 * @returns {number|null}
 */
export function equalOpportunityDifference(groupTPR, referenceTPR) {
  if (groupTPR === null || referenceTPR === null) return null;
  return round(groupTPR - referenceTPR);
}

/**
 * Average Odds Difference
 * AOD = 0.5 * ((FPR_group - FPR_ref) + (TPR_group - TPR_ref))
 * Fair range: [-threshold, +threshold]
 *
 * @param {number|null} groupTPR
 * @param {number|null} refTPR
 * @param {number|null} groupFPR
 * @param {number|null} refFPR
 * @returns {number|null}
 */
export function averageOddsDifference(groupTPR, refTPR, groupFPR, refFPR) {
  if (groupTPR === null || refTPR === null || groupFPR === null || refFPR === null) return null;
  return round(0.5 * ((groupFPR - refFPR) + (groupTPR - refTPR)));
}

// ───────────────────────────────────────────────────────────
// ADVANCED METRICS
// ───────────────────────────────────────────────────────────

/**
 * Calibration by Group
 * Compares mean predicted probability vs. actual outcome rate per group.
 * Requires a predicted_score column (continuous probability).
 *
 * @param {object[]} rows
 * @param {string} targetCol
 * @param {string} scoreCol
 * @param {string} groupCol
 * @returns {object} - { groupName: { mean_score, actual_rate, calibration_gap } }
 */
export function calibrationByGroup(rows, targetCol, scoreCol, groupCol) {
  if (!scoreCol) return null;

  const groups = groupBy(rows, (r) => r[groupCol]);
  const result = {};

  for (const [groupName, groupRows] of groups) {
    const scores = [];
    const actuals = [];

    for (const row of groupRows) {
      const score = row[scoreCol];
      const actual = toBinary(row[targetCol]);
      if (score !== null && score !== undefined && Number.isFinite(Number(score))) {
        scores.push(Number(score));
        actuals.push(actual);
      }
    }

    const meanScore = mean(scores);
    const actualRate = mean(actuals);
    const calibrationGap = (meanScore !== null && actualRate !== null)
      ? round(Math.abs(meanScore - actualRate))
      : null;

    result[groupName] = {
      count: groupRows.length,
      scored_count: scores.length,
      mean_predicted_score: round(meanScore),
      actual_positive_rate: round(actualRate),
      calibration_gap: calibrationGap,
    };
  }

  return result;
}

/**
 * Representation Skew
 * Compares actual group proportions vs. expected uniform distribution.
 * skew = group_proportion / (1 / num_groups)
 * Values > 1 = overrepresented, < 1 = underrepresented
 *
 * @param {object[]} rows
 * @param {string} groupCol
 * @returns {object}
 */
export function representationSkew(rows, groupCol) {
  const groups = groupBy(rows, (r) => r[groupCol]);
  const numGroups = groups.size;
  const expectedProportion = safeDiv(1, numGroups);
  const total = rows.length;

  const result = {};
  for (const [groupName, groupRows] of groups) {
    const proportion = safeDiv(groupRows.length, total);
    result[groupName] = {
      count: groupRows.length,
      proportion: round(proportion),
      expected_proportion: round(expectedProportion),
      skew_ratio: round(safeDiv(proportion, expectedProportion)),
    };
  }

  return result;
}

/**
 * Missingness by Group
 * Computes the fraction of missing values per column per group.
 * Detects potential data collection bias.
 *
 * @param {object[]} rows
 * @param {string} groupCol
 * @param {string[]} columnsToCheck
 * @returns {object}
 */
export function missingnessByGroup(rows, groupCol, columnsToCheck) {
  const groups = groupBy(rows, (r) => r[groupCol]);
  const result = {};

  for (const [groupName, groupRows] of groups) {
    result[groupName] = { count: groupRows.length, columns: {} };

    for (const col of columnsToCheck) {
      const { missing, total, rate } = countMissing(groupRows, col);
      result[groupName].columns[col] = {
        missing,
        total,
        missing_rate: round(rate),
      };
    }
  }

  return result;
}

// ───────────────────────────────────────────────────────────
// MAIN COMPUTATION ORCHESTRATOR
// ───────────────────────────────────────────────────────────

/**
 * Compute ALL fairness metrics for a dataset given a config.
 * This is the main entry point for fairness analysis.
 *
 * Uses streamingGroupAggregate for the core confusion-matrix pass
 * (O(n) per attribute, no per-group row storage).
 *
 * @param {object[]} rows - Parsed dataset rows
 * @param {object} config - Validated configuration
 * @returns {object} - Complete metrics result
 */
export function computeAllMetrics(rows, config) {
  const mappings = config.column_mappings;
  const targetCol = mappings.target_outcome;
  const predictedCol = mappings.predicted_outcome;
  const scoreCol = mappings.predicted_score || null;
  const zdPolicy = config.zero_division_policy || 'null';

  const protectedAttributes = config.protected_attributes || [];

  const result = {
    computed_at: new Date().toISOString(),
    total_records: rows.length,
    zero_division_policy: zdPolicy,
    per_attribute: {},
  };

  for (const attr of protectedAttributes) {
    const { column, reference_group } = attr;

    // ── Streaming pass: O(n) per-group confusion matrices ──
    const groupAggs = streamingGroupAggregate(rows, (r) => r[column], targetCol, predictedCol, toBinary);

    const attrResult = {
      attribute: column,
      reference_group: String(reference_group),
      groups: {},
      fairness_metrics: {},
      advanced: {},
    };

    // Compute group-level metrics from aggregates (no row storage)
    for (const [groupName, agg] of groupAggs) {
      attrResult.groups[groupName] = computeGroupMetricsFromAggregate(agg, zdPolicy);
    }

    // Get reference group metrics
    const refMetrics = attrResult.groups[String(reference_group)];
    if (!refMetrics) {
      attrResult.fairness_metrics = {
        error: `Reference group "${reference_group}" not found in data. Available groups: [${[...groupAggs.keys()].join(', ')}]`,
      };
    } else {
      // Compute fairness metrics for each non-reference group
      const fairnessPerGroup = {};

      for (const [groupName, groupMetrics] of Object.entries(attrResult.groups)) {
        if (groupName === String(reference_group)) continue;

        fairnessPerGroup[groupName] = {
          statistical_parity_difference: statisticalParityDifference(
            groupMetrics.selection_rate,
            refMetrics.selection_rate
          ),
          disparate_impact_ratio: disparateImpactRatio(
            groupMetrics.selection_rate,
            refMetrics.selection_rate
          ),
          equal_opportunity_difference: equalOpportunityDifference(
            groupMetrics.true_positive_rate,
            refMetrics.true_positive_rate
          ),
          average_odds_difference: averageOddsDifference(
            groupMetrics.true_positive_rate,
            refMetrics.true_positive_rate,
            groupMetrics.false_positive_rate,
            refMetrics.false_positive_rate
          ),
        };
      }

      attrResult.fairness_metrics = fairnessPerGroup;
    }

    // Advanced metrics (still use groupBy for row access)
    // Calibration (only if predicted_score column exists)
    if (scoreCol) {
      attrResult.advanced.calibration = calibrationByGroup(rows, targetCol, scoreCol, column);
    }

    // Representation skew
    attrResult.advanced.representation_skew = representationSkew(rows, column);

    // Missingness — check all mapped columns
    const colsToCheck = Object.values(mappings).filter(Boolean);
    attrResult.advanced.missingness = missingnessByGroup(rows, column, colsToCheck);

    result.per_attribute[column] = attrResult;
  }

  return result;
}

// ───────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ───────────────────────────────────────────────────────────

/**
 * Convert a value to binary (0 or 1).
 * Handles: numbers, booleans, strings ("0"/"1"/"true"/"false"/"yes"/"no")
 *
 * @param {*} value
 * @returns {number} 0 or 1
 */
export function toBinary(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  const str = String(value).toLowerCase().trim();
  if (str === '1' || str === 'true' || str === 'yes') return 1;
  return 0;
}
