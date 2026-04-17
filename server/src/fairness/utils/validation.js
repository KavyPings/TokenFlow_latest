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

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that the dataset rows contain all required columns
 * specified in the config column mappings.
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

  // Validate target/predicted are binary-like
  if (errors.length === 0) {
    const targetCol = mappings.target_outcome;
    const predCol = mappings.predicted_outcome;

    const targetValues = new Set(rows.slice(0, 1000).map((r) => r[targetCol]).filter((v) => v !== null));
    const predValues = new Set(rows.slice(0, 1000).map((r) => r[predCol]).filter((v) => v !== null));

    if (targetValues.size > 20) {
      warnings.push(`target_outcome column "${targetCol}" has ${targetValues.size} unique values — expected binary (0/1)`);
    }
    if (predValues.size > 20) {
      warnings.push(`predicted_outcome column "${predCol}" has ${predValues.size} unique values — expected binary (0/1)`);
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
