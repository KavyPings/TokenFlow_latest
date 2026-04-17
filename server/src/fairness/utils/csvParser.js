// ═══════════════════════════════════════════════════════════
// CSV Parser — Lightweight, streaming-capable CSV parser
// Handles: quoted fields, escaped quotes, newlines in quotes
// No external dependencies
// ═══════════════════════════════════════════════════════════

/**
 * Parse a CSV string into an array of objects.
 * Each object is keyed by the header row values.
 *
 * @param {string} csvText - Raw CSV text content
 * @param {object} [options]
 * @param {string} [options.delimiter=','] - Column separator
 * @param {number} [options.maxRows] - Max rows to parse (for safety limits)
 * @returns {{ rows: object[], headers: string[], rowCount: number }}
 */
export function parseCSV(csvText, options = {}) {
  const { delimiter = ',', maxRows = Infinity } = options;

  if (!csvText || typeof csvText !== 'string') {
    throw new Error('CSV input must be a non-empty string');
  }

  const lines = splitCSVLines(csvText);
  if (lines.length < 2) {
    throw new Error('CSV must contain at least a header row and one data row');
  }

  const headers = parseCSVLine(lines[0], delimiter).map((h) => h.trim());

  // Validate headers — no duplicates, no empty
  const seen = new Set();
  for (const header of headers) {
    if (!header) throw new Error('CSV header contains empty column name');
    if (seen.has(header)) throw new Error(`Duplicate CSV header: "${header}"`);
    seen.add(header);
  }

  const rows = [];
  const limit = Math.min(lines.length, maxRows + 1); // +1 for header

  for (let i = 1; i < limit; i++) {
    const line = lines[i];
    if (!line.trim()) continue; // skip blank lines

    const values = parseCSVLine(line, delimiter);
    const row = {};

    for (let j = 0; j < headers.length; j++) {
      const raw = j < values.length ? values[j] : '';
      row[headers[j]] = coerceValue(raw);
    }

    rows.push(row);
  }

  return { rows, headers, rowCount: rows.length };
}

/**
 * Split CSV text into logical lines, respecting quoted fields
 * that may contain newlines.
 * @param {string} text
 * @returns {string[]}
 */
function splitCSVLines(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // Handle escaped quote ("")
      if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
        current += '""';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // End of logical line
      if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
        i++; // skip \n in \r\n
      }
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  // Push last line if non-empty
  if (current.trim()) {
    lines.push(current);
  }

  return lines;
}

/**
 * Parse a single CSV line into an array of field values.
 * Handles quoted fields and escaped quotes.
 * @param {string} line
 * @param {string} delimiter
 * @returns {string[]}
 */
function parseCSVLine(line, delimiter) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Coerce a string value to its most appropriate JS type.
 * Keeps original string if not a clear number/boolean/null.
 * @param {string} raw
 * @returns {string|number|boolean|null}
 */
function coerceValue(raw) {
  const trimmed = raw.trim();

  // Empty / null indicators
  if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'na' || trimmed.toLowerCase() === 'n/a') {
    return null;
  }

  // Boolean
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;

  // Number (int or float)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }

  return trimmed;
}
