// ═══════════════════════════════════════════════════════════
// Math Helpers — Pure, deterministic math functions
// for fairness metric computation.
// No side effects, no external dependencies.
// ═══════════════════════════════════════════════════════════

/**
 * Safe division that returns null instead of Infinity or NaN.
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number|null}
 */
export function safeDiv(numerator, denominator) {
  if (denominator === 0 || !Number.isFinite(denominator)) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

/**
 * Compute a confusion matrix from parallel arrays of actual and predicted binary values.
 * Both arrays must contain 0/1 (or truthy/falsy) values.
 *
 * Runs in O(n) — single pass through data.
 *
 * @param {Array<number|boolean>} actual   - Ground truth labels
 * @param {Array<number|boolean>} predicted - Predicted labels
 * @returns {{ tp: number, fp: number, tn: number, fn: number, total: number }}
 */
export function confusionMatrix(actual, predicted) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  const len = Math.min(actual.length, predicted.length);
  for (let i = 0; i < len; i++) {
    const a = actual[i] ? 1 : 0;
    const p = predicted[i] ? 1 : 0;

    if (a === 1 && p === 1) tp++;
    else if (a === 0 && p === 1) fp++;
    else if (a === 0 && p === 0) tn++;
    else fn++; // a === 1 && p === 0
  }

  return { tp, fp, tn, fn, total: len };
}

/**
 * Group an array of objects by a key function.
 * Returns a Map for ordered iteration.
 *
 * @param {Array<object>} rows
 * @param {function(object): string} keyFn - Function that returns the group key
 * @returns {Map<string, object[]>}
 */
export function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(keyFn(row) ?? '__null__');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

/**
 * Count missing values (null, undefined, empty string, NaN) in a specific column.
 *
 * @param {Array<object>} rows
 * @param {string} column
 * @returns {{ missing: number, total: number, rate: number }}
 */
export function countMissing(rows, column) {
  let missing = 0;
  for (const row of rows) {
    const val = row[column];
    if (val === null || val === undefined || val === '' || (typeof val === 'number' && isNaN(val))) {
      missing++;
    }
  }
  return {
    missing,
    total: rows.length,
    rate: safeDiv(missing, rows.length),
  };
}

/**
 * Convert a map of counts to proportions.
 *
 * @param {Map<string, number>|object} counts - group name → count
 * @returns {object} - group name → proportion
 */
export function proportions(counts) {
  const entries = counts instanceof Map ? [...counts.entries()] : Object.entries(counts);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  const result = {};
  for (const [key, count] of entries) {
    result[key] = safeDiv(count, total);
  }
  return result;
}

/**
 * Round a number to a specified number of decimal places.
 * Returns null for non-finite values.
 *
 * @param {number|null} value
 * @param {number} [places=6]
 * @returns {number|null}
 */
export function round(value, places = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

/**
 * Compute the mean of an array of numbers.
 * Ignores null/undefined/NaN values.
 *
 * @param {Array<number|null>} values
 * @returns {number|null}
 */
export function mean(values) {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return safeDiv(sum, count);
}

/**
 * Safe division with configurable zero-division policy.
 * @param {number} numerator
 * @param {number} denominator
 * @param {'null'|'zero'} policy - What to return when denominator is 0
 * @returns {number|null}
 */
export function safeDivPolicy(numerator, denominator, policy = 'null') {
  if (denominator === 0 || !Number.isFinite(denominator)) {
    return policy === 'zero' ? 0 : null;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : (policy === 'zero' ? 0 : null);
}

/**
 * Streaming group aggregate — computes per-group confusion matrices
 * in a single O(n) pass WITHOUT storing rows per group.
 *
 * Returns Map<groupKey, { tp, fp, tn, fn, count, positives }>.
 *
 * @param {object[]} rows
 * @param {function(object): string} keyFn - Returns group key
 * @param {string} targetCol - Actual outcome column
 * @param {string} predictedCol - Predicted outcome column
 * @param {function(*): number} toBinaryFn - Converts value to 0/1
 * @returns {Map<string, { tp: number, fp: number, tn: number, fn: number, count: number, positives: number }>}
 */
export function streamingGroupAggregate(rows, keyFn, targetCol, predictedCol, toBinaryFn) {
  const groups = new Map();

  for (const row of rows) {
    const key = String(keyFn(row) ?? '__null__');
    if (!groups.has(key)) {
      groups.set(key, { tp: 0, fp: 0, tn: 0, fn: 0, count: 0, positives: 0 });
    }
    const agg = groups.get(key);
    const a = toBinaryFn(row[targetCol]);
    const p = toBinaryFn(row[predictedCol]);

    agg.count++;
    if (p === 1) agg.positives++;

    if (a === 1 && p === 1) agg.tp++;
    else if (a === 0 && p === 1) agg.fp++;
    else if (a === 0 && p === 0) agg.tn++;
    else agg.fn++; // a === 1 && p === 0
  }

  return groups;
}

