// ═══════════════════════════════════════════════════════════
// Fairness Routes — REST API for the fairness auditing system
//
// Endpoints:
//   POST   /api/fairness/upload                  Upload dataset + config
//   GET    /api/fairness/datasets                 List datasets
//   GET    /api/fairness/datasets/:id             Get dataset details
//   POST   /api/fairness/datasets/:id/analyze     Run fairness analysis
//   GET    /api/fairness/datasets/:id/report      Get latest report
//   GET    /api/fairness/datasets/:id/audit-trail Get audit history
//   GET    /api/fairness/review-queue             Get flagged violations
//   PATCH  /api/fairness/review-queue/:id         Update review item
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { parseCSV } from '../fairness/utils/csvParser.js';
import {
  validateConfig,
  validateDatasetSchema,
  validateFileUpload,
  sanitizeString,
} from '../fairness/utils/validation.js';
import { computeAllMetrics } from '../fairness/services/fairnessMetrics.js';
import { profileDataset } from '../fairness/services/datasetProfiler.js';
import {
  logAuditEvent,
  getAuditTrail,
  generateReport,
  getLatestReport,
  getReviewQueue,
  updateReviewItem,
} from '../fairness/services/auditService.js';

const router = Router();

// Multer config: store in memory (we persist to SQLite, not disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// ───────────────────────────────────────────────────────────
// POST /upload — Upload dataset with config
// ───────────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    const db = getDb();

    // ── Validate file ──────────────────────────────────
    const fileValidation = validateFileUpload(req.file);
    if (!fileValidation.valid) {
      return res.status(400).json({
        error: 'INVALID_FILE',
        details: fileValidation.errors,
      });
    }

    // ── Parse config from form data ────────────────────
    let config;
    try {
      config = JSON.parse(req.body.config || '{}');
    } catch (e) {
      return res.status(400).json({
        error: 'INVALID_CONFIG',
        details: ['Config must be valid JSON'],
      });
    }

    // ── Validate config ────────────────────────────────
    const configValidation = validateConfig(config);
    if (!configValidation.valid) {
      return res.status(400).json({
        error: 'INVALID_CONFIG',
        details: configValidation.errors,
      });
    }

    // ── Parse file content ─────────────────────────────
    const fileContent = req.file.buffer.toString('utf-8');
    let rows;

    if (fileValidation.fileType === 'csv') {
      const parsed = parseCSV(fileContent, { maxRows: 1_000_000 });
      rows = parsed.rows;
    } else {
      // JSON — expect array of objects
      try {
        const parsed = JSON.parse(fileContent);
        if (!Array.isArray(parsed)) {
          return res.status(400).json({
            error: 'INVALID_FILE',
            details: ['JSON file must contain an array of objects'],
          });
        }
        rows = parsed;
      } catch (e) {
        return res.status(400).json({
          error: 'INVALID_FILE',
          details: ['Failed to parse JSON file: ' + e.message],
        });
      }
    }

    // ── Validate schema against config ─────────────────
    const schemaValidation = validateDatasetSchema(rows, config);
    if (!schemaValidation.valid) {
      return res.status(400).json({
        error: 'SCHEMA_MISMATCH',
        details: schemaValidation.errors,
        warnings: schemaValidation.warnings,
      });
    }

    // ── Persist dataset ────────────────────────────────
    const datasetId = uuidv4();
    const datasetName = sanitizeString(config.dataset_name, 255);

    const stmt = db.prepare(`
      INSERT INTO fairness_datasets (id, name, file_name, file_type, row_count, config, data_blob, status, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', ?)
    `);

    stmt.run(
      datasetId,
      datasetName,
      sanitizeString(req.file.originalname, 255),
      fileValidation.fileType,
      rows.length,
      JSON.stringify(config),
      JSON.stringify(rows),
      req.auth?.sub || 'anonymous'
    );

    // ── Log audit event ────────────────────────────────
    logAuditEvent(db, {
      datasetId,
      action: 'upload',
      details: {
        file_name: req.file.originalname,
        file_type: fileValidation.fileType,
        file_size: req.file.size,
        row_count: rows.length,
        warnings: schemaValidation.warnings,
      },
      config,
      actor: req.auth?.sub || 'anonymous',
    });

    // ── Auto-profile ───────────────────────────────────
    const profile = profileDataset(rows, config);

    db.prepare(`
      UPDATE fairness_datasets
      SET profile = ?, status = 'profiled', updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(profile), datasetId);

    logAuditEvent(db, {
      datasetId,
      action: 'profile',
      details: {
        total_rows: profile.total_rows,
        total_columns: profile.total_columns,
        group_distributions: profile.group_distributions,
      },
      actor: req.auth?.sub || 'anonymous',
    });

    return res.status(201).json({
      success: true,
      dataset_id: datasetId,
      name: datasetName,
      row_count: rows.length,
      status: 'profiled',
      profile,
      warnings: schemaValidation.warnings,
    });
  } catch (err) {
    console.error('[FAIRNESS] Upload error:', err);
    return res.status(500).json({
      error: 'UPLOAD_FAILED',
      message: err.message,
    });
  }
});

// ───────────────────────────────────────────────────────────
// GET /datasets — List all uploaded datasets
// ───────────────────────────────────────────────────────────
router.get('/datasets', (req, res) => {
  try {
    const db = getDb();
    const datasets = db.prepare(`
      SELECT id, name, file_name, file_type, row_count, status, uploaded_by, created_at, updated_at
      FROM fairness_datasets
      ORDER BY created_at DESC
    `).all();

    return res.json({ datasets, total: datasets.length });
  } catch (err) {
    console.error('[FAIRNESS] List error:', err);
    return res.status(500).json({ error: 'LIST_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// GET /datasets/:id — Get dataset details + profile
// ───────────────────────────────────────────────────────────
router.get('/datasets/:id', (req, res) => {
  try {
    const db = getDb();
    const dataset = db.prepare(`
      SELECT id, name, file_name, file_type, row_count, config, profile, status, error_message, uploaded_by, created_at, updated_at
      FROM fairness_datasets
      WHERE id = ?
    `).get(req.params.id);

    if (!dataset) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Dataset not found' });
    }

    return res.json({
      ...dataset,
      config: safeJsonParse(dataset.config, {}),
      profile: safeJsonParse(dataset.profile, null),
    });
  } catch (err) {
    console.error('[FAIRNESS] Get dataset error:', err);
    return res.status(500).json({ error: 'GET_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// POST /datasets/:id/analyze — Run fairness analysis
// ───────────────────────────────────────────────────────────
router.post('/datasets/:id/analyze', (req, res) => {
  try {
    const db = getDb();
    const dataset = db.prepare(`
      SELECT id, config, data_blob, status
      FROM fairness_datasets
      WHERE id = ?
    `).get(req.params.id);

    if (!dataset) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Dataset not found' });
    }

    const config = safeJsonParse(dataset.config, {});
    const rows = safeJsonParse(dataset.data_blob, []);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'EMPTY_DATASET', message: 'Dataset contains no rows' });
    }

    // Allow config overrides from request body
    const overrides = req.body || {};
    if (overrides.thresholds && typeof overrides.thresholds === 'object') {
      config.thresholds = { ...(config.thresholds || {}), ...overrides.thresholds };
    }

    // ── Compute all metrics ────────────────────────────
    const metrics = computeAllMetrics(rows, config);

    // ── Profile (re-compute if not done) ───────────────
    let profile = safeJsonParse(
      db.prepare('SELECT profile FROM fairness_datasets WHERE id = ?').get(req.params.id)?.profile,
      null
    );
    if (!profile) {
      profile = profileDataset(rows, config);
    }

    // ── Generate report (persists to DB) ───────────────
    const report = generateReport(db, req.params.id, profile, metrics, config);

    // ── Update dataset status ──────────────────────────
    db.prepare(`
      UPDATE fairness_datasets
      SET status = 'analyzed', updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    // ── Log audit event ────────────────────────────────
    logAuditEvent(db, {
      datasetId: req.params.id,
      action: 'analyze',
      details: {
        risk_level: report.risk_level,
        violation_count: report.violation_count,
        thresholds_used: report.thresholds_used,
      },
      config,
      metrics,
      actor: req.auth?.sub || 'anonymous',
    });

    return res.json({
      success: true,
      dataset_id: req.params.id,
      report,
    });
  } catch (err) {
    console.error('[FAIRNESS] Analysis error:', err);

    // Log error in audit trail
    try {
      const db = getDb();
      logAuditEvent(db, {
        datasetId: req.params.id,
        action: 'analyze_error',
        details: { error: err.message },
        actor: req.auth?.sub || 'anonymous',
      });

      db.prepare(`
        UPDATE fairness_datasets
        SET status = 'error', error_message = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(err.message, req.params.id);
    } catch { /* don't mask original error */ }

    return res.status(500).json({ error: 'ANALYSIS_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// GET /datasets/:id/report — Get latest report
// ───────────────────────────────────────────────────────────
router.get('/datasets/:id/report', (req, res) => {
  try {
    const db = getDb();

    // Verify dataset exists
    const exists = db.prepare('SELECT id FROM fairness_datasets WHERE id = ?').get(req.params.id);
    if (!exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Dataset not found' });
    }

    const report = getLatestReport(db, req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'NO_REPORT', message: 'No report generated yet. Run analysis first.' });
    }

    return res.json(report);
  } catch (err) {
    console.error('[FAIRNESS] Get report error:', err);
    return res.status(500).json({ error: 'GET_REPORT_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// GET /datasets/:id/audit-trail — Get audit history
// ───────────────────────────────────────────────────────────
router.get('/datasets/:id/audit-trail', (req, res) => {
  try {
    const db = getDb();

    const exists = db.prepare('SELECT id FROM fairness_datasets WHERE id = ?').get(req.params.id);
    if (!exists) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Dataset not found' });
    }

    const trail = getAuditTrail(db, req.params.id);
    return res.json({ dataset_id: req.params.id, audit_trail: trail, total: trail.length });
  } catch (err) {
    console.error('[FAIRNESS] Audit trail error:', err);
    return res.status(500).json({ error: 'AUDIT_TRAIL_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// GET /review-queue — Get flagged violations
// ───────────────────────────────────────────────────────────
router.get('/review-queue', (req, res) => {
  try {
    const db = getDb();
    const result = getReviewQueue(db, {
      dataset_id: req.query.dataset_id,
      status: req.query.status,
      severity: req.query.severity,
      limit: req.query.limit,
      offset: req.query.offset,
    });

    return res.json(result);
  } catch (err) {
    console.error('[FAIRNESS] Review queue error:', err);
    return res.status(500).json({ error: 'REVIEW_QUEUE_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// PATCH /review-queue/:id — Update review item status
// ───────────────────────────────────────────────────────────
router.patch('/review-queue/:id', (req, res) => {
  try {
    const db = getDb();
    const { status, reviewer, review_notes } = req.body || {};

    if (!status) {
      return res.status(400).json({
        error: 'MISSING_STATUS',
        message: 'Request body must include "status" field',
      });
    }

    const updated = updateReviewItem(db, req.params.id, {
      status,
      reviewer: reviewer || req.auth?.sub || 'anonymous',
      review_notes: review_notes ? sanitizeString(review_notes, 2000) : null,
    });

    if (!updated) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Review item not found' });
    }

    // Log the review action
    logAuditEvent(db, {
      datasetId: updated.dataset_id,
      action: 'review_update',
      details: {
        review_item_id: req.params.id,
        new_status: status,
        metric: updated.metric_name,
        group: updated.group_name,
      },
      actor: req.auth?.sub || 'anonymous',
    });

    return res.json({ success: true, item: updated });
  } catch (err) {
    console.error('[FAIRNESS] Review update error:', err);
    return res.status(500).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// HELPER
// ───────────────────────────────────────────────────────────

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export default router;
