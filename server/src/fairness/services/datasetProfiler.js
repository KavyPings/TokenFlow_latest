// ═══════════════════════════════════════════════════════════
// Dataset Profiler — Produces a statistical profile of an
// uploaded dataset before fairness analysis.
// ═══════════════════════════════════════════════════════════

import { groupBy, countMissing, round, safeDiv } from '../utils/mathHelpers.js';

/**
 * Profile a dataset: compute summary statistics, distributions,
 * and data quality indicators.
 *
 * Designed for O(n) single-pass computation where possible.
 *
 * @param {object[]} rows - Parsed dataset rows
 * @param {object} config - Validated config with column mappings and protected attributes
 * @returns {object} - Dataset profile
 */
export function profileDataset(rows, config) {
  const mappings = config.column_mappings;
  const protectedAttrs = config.protected_attributes || [];

  const profile = {
    profiled_at: new Date().toISOString(),
    dataset_name: config.dataset_name,
    total_rows: rows.length,
    total_columns: rows.length > 0 ? Object.keys(rows[0]).length : 0,
    columns: [],
    target_distribution: null,
    prediction_distribution: null,
    group_distributions: {},
    missing_values: {},
    timestamp_range: null,
    model_versions: null,
  };

  if (rows.length === 0) return profile;

  const allColumns = Object.keys(rows[0]);

  // ── Column info ────────────────────────────────────────
  for (const col of allColumns) {
    const info = analyzeColumn(rows, col);
    profile.columns.push(info);
  }

  // ── Target outcome distribution ────────────────────────
  const targetCol = mappings.target_outcome;
  if (targetCol) {
    profile.target_distribution = computeValueDistribution(rows, targetCol);
  }

  // ── Predicted outcome distribution ─────────────────────
  const predCol = mappings.predicted_outcome;
  if (predCol) {
    profile.prediction_distribution = computeValueDistribution(rows, predCol);
  }

  // ── Group distributions per protected attribute ────────
  for (const attr of protectedAttrs) {
    const groups = groupBy(rows, (r) => r[attr.column]);
    const distribution = {};

    for (const [groupName, groupRows] of groups) {
      distribution[groupName] = {
        count: groupRows.length,
        percentage: round(safeDiv(groupRows.length, rows.length) * 100, 2),
      };
    }

    profile.group_distributions[attr.column] = {
      total_groups: groups.size,
      reference_group: String(attr.reference_group),
      distribution,
    };
  }

  // ── Missing values per column ──────────────────────────
  const mappedColumns = Object.values(mappings).filter(Boolean);
  for (const col of mappedColumns) {
    if (allColumns.includes(col)) {
      const { missing, total, rate } = countMissing(rows, col);
      profile.missing_values[col] = {
        missing_count: missing,
        total: total,
        missing_rate: round(rate, 4),
      };
    }
  }

  // ── Timestamp range ────────────────────────────────────
  const timestampCol = mappings.timestamp;
  if (timestampCol && allColumns.includes(timestampCol)) {
    profile.timestamp_range = computeTimestampRange(rows, timestampCol);
  }

  // ── Model version distribution ─────────────────────────
  const versionCol = mappings.model_version;
  if (versionCol && allColumns.includes(versionCol)) {
    profile.model_versions = computeValueDistribution(rows, versionCol);
  }

  return profile;
}

// ───────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ───────────────────────────────────────────────────────────

/**
 * Analyze a single column: infer type, compute basic stats.
 *
 * @param {object[]} rows
 * @param {string} col
 * @returns {object}
 */
function analyzeColumn(rows, col) {
  let numericCount = 0;
  let nullCount = 0;
  let min = Infinity;
  let max = -Infinity;
  const uniqueValues = new Set();

  for (const row of rows) {
    const val = row[col];

    if (val === null || val === undefined || val === '') {
      nullCount++;
      continue;
    }

    // Track up to 1000 uniques to avoid memory issues
    if (uniqueValues.size < 1000) {
      uniqueValues.add(val);
    }

    if (typeof val === 'number' && Number.isFinite(val)) {
      numericCount++;
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  const nonNull = rows.length - nullCount;
  const isNumeric = nonNull > 0 && numericCount / nonNull > 0.9;

  const info = {
    name: col,
    inferred_type: isNumeric ? 'numeric' : 'categorical',
    total: rows.length,
    non_null: nonNull,
    null_count: nullCount,
    null_rate: round(safeDiv(nullCount, rows.length), 4),
    unique_count: uniqueValues.size >= 1000 ? '1000+' : uniqueValues.size,
  };

  if (isNumeric && Number.isFinite(min)) {
    info.min = min;
    info.max = max;
  }

  return info;
}

/**
 * Compute value distribution for a column (count & percentage per value).
 *
 * @param {object[]} rows
 * @param {string} col
 * @returns {object}
 */
function computeValueDistribution(rows, col) {
  const counts = new Map();

  for (const row of rows) {
    const val = row[col] === null || row[col] === undefined ? '__null__' : String(row[col]);
    counts.set(val, (counts.get(val) || 0) + 1);
  }

  const distribution = {};
  for (const [val, count] of counts) {
    distribution[val] = {
      count,
      percentage: round(safeDiv(count, rows.length) * 100, 2),
    };
  }

  return {
    unique_values: counts.size,
    distribution,
  };
}

/**
 * Compute timestamp range (earliest and latest).
 *
 * @param {object[]} rows
 * @param {string} col
 * @returns {{ earliest: string, latest: string }|null}
 */
function computeTimestampRange(rows, col) {
  let earliest = null;
  let latest = null;

  for (const row of rows) {
    const val = row[col];
    if (val === null || val === undefined || val === '') continue;

    const str = String(val);
    if (!earliest || str < earliest) earliest = str;
    if (!latest || str > latest) latest = str;
  }

  if (!earliest) return null;

  return { earliest, latest };
}
