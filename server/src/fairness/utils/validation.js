// ═══════════════════════════════════════════════════════════
// Validation — Input validation for fairness auditing system
// Validates configs, schemas, uploads. Returns structured errors.
// ═══════════════════════════════════════════════════════════

/** Maximum allowed file size in bytes (50 MB) */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Maximum allowed rows in a dataset */
const MAX_ROWS = 1_000_000;

/** Allowed file extensions */
const ALLOWED_EXTENSIONS = ['csv', 'json'];

/** Required fields in the config object */
const REQUIRED_CONFIG_FIELDS = ['dataset_name', 'column_mappings', 'protected_attributes'];

/** Required column mapping keys */
const REQUIRED_COLUMN_MAPPINGS = ['record_id', 'target_outcome', 'predicted_outcome', 'timestamp', 'model_version'];

/** Optional column mapping keys */
const OPTIONAL_COLUMN_MAPPINGS = ['predicted_score', 'decision_context', 'dataset_split'];

/** Accepted binary string values (lowercased) */
const BINARY_TRUE = new Set(['1', 'true', 'yes']);
const BINARY_FALSE = new Set(['0', 'false', 'no']);
const BINARY_ALL = new Set([...BINARY_TRUE, ...BINARY_FALSE]);

/**
 * Validate the user-provided fairness config object.
 * Returns { valid: boolean, errors: string[] }
 *
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be a non-null object'] };
  }

  // Check required top-level fields
  for (const field of REQUIRED_CONFIG_FIELDS) {
    if (!(field in config) || config[field] === null || config[field] === undefined) {
      errors.push(`Missing required config field: "${field}"`);
    }
  }

  // Validate dataset_name
  if (config.dataset_name !== undefined) {
    if (typeof config.dataset_name !== 'string' || config.dataset_name.trim().length === 0) {
      errors.push('"dataset_name" must be a non-empty string');
    } else if (config.dataset_name.length > 255) {
      errors.push('"dataset_name" must be 255 characters or fewer');
    }
  }

  // Validate column_mappings
  if (config.column_mappings !== undefined) {
    if (typeof config.column_mappings !== 'object' || Array.isArray(config.column_mappings)) {
      errors.push('"column_mappings" must be a plain object');
    } else {
      for (const key of REQUIRED_COLUMN_MAPPINGS) {
        const value = config.column_mappings[key];
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          errors.push(`Missing or invalid column mapping: "${key}"`);
        }
      }
      // Validate optional mappings if provided
      for (const key of OPTIONAL_COLUMN_MAPPINGS) {
        if (key in config.column_mappings) {
          const value = config.column_mappings[key];
          if (typeof value !== 'string' || value.trim().length === 0) {
            errors.push(`Optional column mapping "${key}" must be a non-empty string if provided`);
          }
        }
      }
    }
  }

  // Validate protected_attributes
  if (config.protected_attributes !== undefined) {
    if (!Array.isArray(config.protected_attributes)) {
      errors.push('"protected_attributes" must be an array');
    } else if (config.protected_attributes.length === 0) {
      errors.push('"protected_attributes" must contain at least one attribute');
    } else {
      for (let i = 0; i < config.protected_attributes.length; i++) {
        const attr = config.protected_attributes[i];
        if (!attr || typeof attr !== 'object') {
          errors.push(`protected_attributes[${i}] must be an object`);
          continue;
        }
        if (!attr.column || typeof attr.column !== 'string') {
          errors.push(`protected_attributes[${i}].column must be a non-empty string`);
        }
        if (
          attr.reference_group === undefined ||
          attr.reference_group === null ||
          (typeof attr.reference_group === 'string' && attr.reference_group.trim() === '')
        ) {
          errors.push(`protected_attributes[${i}].reference_group is required`);
        }
      }
    }
  }

  // Validate thresholds (optional, but validate structure if present)
  if (config.thresholds !== undefined) {
    if (typeof config.thresholds !== 'object' || Array.isArray(config.thresholds)) {
      errors.push('"thresholds" must be a plain object');
    } else {
      const validThresholdKeys = [
        'statistical_parity_difference',
        'disparate_impact_ratio_min',
        'disparate_impact_ratio_max',
        'equal_opportunity_difference',
        'average_odds_difference',
      ];
      for (const [key, value] of Object.entries(config.thresholds)) {
        if (!validThresholdKeys.includes(key)) {
          errors.push(`Unknown threshold key: "${key}"`);
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`Threshold "${key}" must be a finite number`);
        }
      }
    }
  }

  // Validate zero_division_policy (optional)
  if (config.zero_division_policy !== undefined) {
    if (config.zero_division_policy !== 'null' && config.zero_division_policy !== 'zero') {
      errors.push('"zero_division_policy" must be "null" or "zero"');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that the dataset rows contain all required columns,
 * enforce binary-only y_true/y_pred, reject nulls in required columns,
 * and require ≥2 observed groups per protected attribute.
 *
 * @param {object[]} rows - Parsed dataset rows
 * @param {object} config - Validated config object
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateDatasetSchema(rows, config) {
  const errors = [];
  const warnings = [];

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return { valid: false, errors: ['Dataset must contain at least one row'], warnings };
  }

  if (rows.length > MAX_ROWS) {
    return { valid: false, errors: [`Dataset exceeds maximum row limit of ${MAX_ROWS.toLocaleString()}`], warnings };
  }

  const sampleRow = rows[0];
  const availableColumns = Object.keys(sampleRow);

  // Check required column mappings exist in data
  const mappings = config.column_mappings || {};
  for (const [logicalName, actualColumn] of Object.entries(mappings)) {
    if (!availableColumns.includes(actualColumn)) {
      if (REQUIRED_COLUMN_MAPPINGS.includes(logicalName)) {
        errors.push(`Required column "${actualColumn}" (mapped as "${logicalName}") not found in dataset. Available: [${availableColumns.join(', ')}]`);
      } else {
        warnings.push(`Optional column "${actualColumn}" (mapped as "${logicalName}") not found in dataset`);
      }
    }
  }

  // Check protected attribute columns exist
  const protectedAttrs = config.protected_attributes || [];
  for (const attr of protectedAttrs) {
    if (!availableColumns.includes(attr.column)) {
      errors.push(`Protected attribute column "${attr.column}" not found in dataset`);
    }
  }

  // If column-existence errors, stop here (can't validate values)
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // ── Strict binary enforcement on ALL rows ──────────────
  const targetCol = mappings.target_outcome;
  const predCol = mappings.predicted_outcome;
  const recordIdCol = mappings.record_id;
  const requiredCols = [recordIdCol, targetCol, predCol].filter(Boolean);

  let nullsInRequired = 0;
  let nonBinaryTarget = 0;
  let nonBinaryPred = 0;
  let firstBadTargetVal = null;
  let firstBadPredVal = null;

  for (const row of rows) {
    // Null check on required columns
    for (const col of requiredCols) {
      const val = row[col];
      if (val === null || val === undefined || val === '') {
        nullsInRequired++;
      }
    }

    // Binary check on target_outcome
    const targetVal = row[targetCol];
    if (targetVal !== null && targetVal !== undefined && targetVal !== '') {
      const strVal = String(targetVal).toLowerCase().trim();
      if (!BINARY_ALL.has(strVal)) {
        nonBinaryTarget++;
        if (!firstBadTargetVal) firstBadTargetVal = targetVal;
      }
    }

    // Binary check on predicted_outcome
    const predVal = row[predCol];
    if (predVal !== null && predVal !== undefined && predVal !== '') {
      const strVal = String(predVal).toLowerCase().trim();
      if (!BINARY_ALL.has(strVal)) {
        nonBinaryPred++;
        if (!firstBadPredVal) firstBadPredVal = predVal;
      }
    }
  }

  if (nullsInRequired > 0) {
    errors.push(`Found ${nullsInRequired} null/empty value(s) in required columns [${requiredCols.join(', ')}]. All required columns must be fully populated.`);
  }

  if (nonBinaryTarget > 0) {
    errors.push(`target_outcome column "${targetCol}" contains ${nonBinaryTarget} non-binary value(s) (e.g. "${firstBadTargetVal}"). Only 0/1/true/false/yes/no are allowed.`);
  }

  if (nonBinaryPred > 0) {
    errors.push(`predicted_outcome column "${predCol}" contains ${nonBinaryPred} non-binary value(s) (e.g. "${firstBadPredVal}"). Only 0/1/true/false/yes/no are allowed.`);
  }

  // ── Require ≥2 observed groups per protected attribute ──
  for (const attr of protectedAttrs) {
    const observedGroups = new Set();
    for (const row of rows) {
      const val = row[attr.column];
      if (val !== null && val !== undefined && val !== '') {
        observedGroups.add(String(val));
      }
    }
    if (observedGroups.size < 2) {
      errors.push(`Protected attribute "${attr.column}" has only ${observedGroups.size} observed group(s): [${[...observedGroups].join(', ')}]. At least 2 groups are required for fairness comparison.`);
    }
    // Warn if reference_group not found in observed groups
    if (observedGroups.size >= 2 && !observedGroups.has(String(attr.reference_group))) {
      warnings.push(`Reference group "${attr.reference_group}" for attribute "${attr.column}" not found in observed groups: [${[...observedGroups].join(', ')}]`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate an uploaded file.
 *
 * @param {{ originalname: string, size: number, mimetype: string }} file - Multer file object
 * @returns {{ valid: boolean, errors: string[], fileType: string|null }}
 */
export function validateFileUpload(file) {
  const errors = [];
  let fileType = null;

  if (!file) {
    return { valid: false, errors: ['No file provided'], fileType: null };
  }

  // Check size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Check extension
  const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    errors.push(`File extension ".${ext}" not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  } else {
    fileType = ext;
  }

  // Check mime type (basic validation — don't trust blindly)
  const allowedMimes = [
    'text/csv',
    'application/json',
    'text/plain',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ];
  if (file.mimetype && !allowedMimes.includes(file.mimetype)) {
    errors.push(`Unexpected MIME type: ${file.mimetype}`);
  }

  return { valid: errors.length === 0, errors, fileType };
}

/**
 * Sanitize a string to prevent injection attacks.
 * Removes control characters and trims.
 *
 * @param {string} str
 * @param {number} [maxLength=1000]
 * @returns {string}
 */
export function sanitizeString(str, maxLength = 1000) {
  if (typeof str !== 'string') return '';
  // Remove control characters (except newline/tab)
  return str.replace(/[^\x20-\x7E\n\t]/g, '').trim().slice(0, maxLength);
}

/**
 * Get default thresholds for fairness metrics.
 * Used when user doesn't provide custom thresholds.
 *
 * @returns {object}
 */
export function getDefaultThresholds() {
  return {
    statistical_parity_difference: 0.1,
    disparate_impact_ratio_min: 0.8,
    disparate_impact_ratio_max: 1.25,
    equal_opportunity_difference: 0.1,
    average_odds_difference: 0.1,
  };
}
