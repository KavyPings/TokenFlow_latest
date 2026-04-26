// ═══════════════════════════════════════════════════════════
// Enterprise Routes — Full-service audit pipeline for real
// company workflows and datasets.
//
// Endpoints:
//   POST   /api/enterprise/analyze-context         Gemini context analysis
//   POST   /api/enterprise/analyze-context-manual   Re-analyze with user context
//   POST   /api/enterprise/run-workflow             Execute uploaded workflow
//   POST   /api/enterprise/run-fairness             Upload + analyze dataset
//   POST   /api/enterprise/datasets/:id/mitigate    Run mitigation
//   GET    /api/enterprise/datasets/:id/mitigated-dataset  Download mitigated CSV/JSON
//   GET    /api/enterprise/datasets/:id/report      Get latest report
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
  generateReport,
  getLatestReport,
} from '../fairness/services/auditService.js';
import {
  runMitigation,
  getLatestMitigationReport,
  applyMitigationToRows,
} from '../fairness/services/mitigationService.js';
import { validateWorkflow, sanitizeWorkflow } from '../engine/workflowSchema.js';
import { workflowRunner } from '../engine/workflowRunner.js';
import { analyzeEnterpriseContext } from '../services/geminiService.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ───────────────────────────────────────────────────────────
// POST /analyze-context — Gemini context analysis
// ───────────────────────────────────────────────────────────
router.post('/analyze-context', async (req, res) => {
  try {
    const { workflow, datasetMeta } = req.body;
    if (!workflow && !datasetMeta) {
      return res.status(400).json({ error: 'Provide at least workflow or datasetMeta' });
    }

    const result = await analyzeEnterpriseContext(workflow || {}, datasetMeta || {});
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ENTERPRISE] Context analysis error:', err.message);
    return res.status(500).json({ error: 'CONTEXT_ANALYSIS_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// POST /analyze-context-manual — Re-analyze with user context
// ───────────────────────────────────────────────────────────
router.post('/analyze-context-manual', async (req, res) => {
  try {
    const { workflow, datasetMeta, userContext } = req.body;
    if (!userContext) {
      return res.status(400).json({ error: 'Provide userContext field' });
    }

    const result = await analyzeEnterpriseContext(workflow || {}, datasetMeta || {}, userContext);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ENTERPRISE] Manual context analysis error:', err.message);
    return res.status(500).json({ error: 'CONTEXT_ANALYSIS_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// POST /run-workflow — Execute uploaded workflow through token engine
// ───────────────────────────────────────────────────────────
router.post('/run-workflow', async (req, res) => {
  try {
    const { definition } = req.body;
    if (!definition) {
      return res.status(400).json({ error: 'Missing workflow definition' });
    }

    const validation = validateWorkflow(definition);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        errors: validation.errors,
      });
    }

    const sanitized = sanitizeWorkflow(definition);
    const taskData = {
      id: `ent_${uuidv4().slice(0, 12)}`,
      name: sanitized.name || 'Enterprise Workflow',
      description: sanitized.description || '',
      agent: sanitized.agent || 'agent-cloud-worker',
      malicious: sanitized.malicious,
      replay: sanitized.replay,
      escalation: sanitized.escalation,
      enforce_fairness_gate: sanitized.enforce_fairness_gate,
      ...(sanitized.kill_at_step !== undefined ? { kill_at_step: sanitized.kill_at_step } : {}),
      ...(sanitized.pause_at_step !== undefined ? { pause_at_step: sanitized.pause_at_step } : {}),
      ...(Array.isArray(sanitized.approved_steps) && sanitized.approved_steps.length > 0 ? { approved_steps: sanitized.approved_steps } : {}),
      ...(sanitized.malicious_step ? { malicious_step: sanitized.malicious_step } : {}),
      ...(sanitized.escalation_step ? { escalation_step: sanitized.escalation_step } : {}),
      steps: sanitized.steps,
    };

    const result = await workflowRunner.startWorkflow(taskData, {
      workflowType: 'mission',
    });

    res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error('[ENTERPRISE] Workflow run error:', err.message);
    res.status(500).json({ error: 'WORKFLOW_RUN_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// POST /run-fairness — Upload dataset + run full analysis pipeline
// ───────────────────────────────────────────────────────────
router.post('/run-fairness', upload.single('file'), async (req, res) => {
  try {
    const db = getDb();

    // Validate file
    const fileValidation = validateFileUpload(req.file);
    if (!fileValidation.valid) {
      return res.status(400).json({ error: 'INVALID_FILE', details: fileValidation.errors });
    }

    // Parse config
    let config;
    try {
      config = JSON.parse(req.body.config || '{}');
    } catch {
      return res.status(400).json({ error: 'INVALID_CONFIG', details: ['Config must be valid JSON'] });
    }

    const configValidation = validateConfig(config);
    if (!configValidation.valid) {
      return res.status(400).json({ error: 'INVALID_CONFIG', details: configValidation.errors });
    }

    // Parse file
    const fileContent = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
    let rows;

    if (fileValidation.fileType === 'csv') {
      const parsed = parseCSV(fileContent, { maxRows: 1_000_000 });
      rows = parsed.rows;
    } else {
      const parsed = JSON.parse(fileContent);
      rows = extractRows(parsed);
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: 'INVALID_FILE', details: ['JSON must be an array of row objects'] });
      }
    }

    // Validate schema
    const schemaValidation = validateDatasetSchema(rows, config);
    if (!schemaValidation.valid) {
      return res.status(400).json({ error: 'SCHEMA_MISMATCH', details: schemaValidation.errors });
    }

    // Persist
    const datasetId = uuidv4();
    const datasetName = sanitizeString(config.dataset_name || 'Enterprise Dataset', 255);

    db.prepare(`
      INSERT INTO fairness_datasets (id, name, file_name, file_type, row_count, config, data_blob, status, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', ?)
    `).run(
      datasetId, datasetName,
      sanitizeString(req.file.originalname, 255),
      fileValidation.fileType,
      rows.length,
      JSON.stringify(config),
      JSON.stringify(rows),
      'enterprise-user'
    );

    // Profile
    const profile = profileDataset(rows, config);
    db.prepare(`
      UPDATE fairness_datasets SET profile = ?, status = 'profiled', updated_at = datetime('now') WHERE id = ?
    `).run(JSON.stringify(profile), datasetId);

    // Analyze
    const metrics = computeAllMetrics(rows, config);
    const report = await generateReport(db, datasetId, profile, metrics, config);

    db.prepare(`
      UPDATE fairness_datasets SET status = 'analyzed', updated_at = datetime('now') WHERE id = ?
    `).run(datasetId);

    await logAuditEvent(db, {
      datasetId,
      action: 'enterprise_analyze',
      details: { risk_level: report.risk_level, violation_count: report.violation_count },
      actor: 'enterprise-user',
    });

    return res.json({
      success: true,
      dataset_id: datasetId,
      name: datasetName,
      row_count: rows.length,
      profile,
      report,
    });
  } catch (err) {
    console.error('[ENTERPRISE] Fairness run error:', err.message);
    return res.status(500).json({ error: 'FAIRNESS_RUN_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// POST /datasets/:id/mitigate — Run mitigation
// ───────────────────────────────────────────────────────────
router.post('/datasets/:id/mitigate', async (req, res) => {
  try {
    const db = getDb();
    const dataset = db.prepare('SELECT id, config, data_blob, status FROM fairness_datasets WHERE id = ?').get(req.params.id);
    if (!dataset) return res.status(404).json({ error: 'NOT_FOUND' });
    if (dataset.status !== 'analyzed') return res.status(400).json({ error: 'NOT_ANALYZED', message: 'Run analysis first.' });

    const config = safeJsonParse(dataset.config, {});
    const rows = safeJsonParse(dataset.data_blob, []);
    const latestReport = await getLatestReport(db, req.params.id);
    if (!latestReport) return res.status(400).json({ error: 'NO_REPORT' });

    const mitigationReport = runMitigation(db, req.params.id, latestReport.id, rows, config);

    return res.json({
      success: true,
      mitigation: mitigationReport,
      download_urls: {
        json: `/api/enterprise/datasets/${req.params.id}/mitigated-dataset?format=json`,
        csv: `/api/enterprise/datasets/${req.params.id}/mitigated-dataset?format=csv`,
      },
    });
  } catch (err) {
    console.error('[ENTERPRISE] Mitigation error:', err.message);
    return res.status(500).json({ error: 'MITIGATION_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// GET /datasets/:id/mitigated-dataset — Download mitigated rows
// ───────────────────────────────────────────────────────────
router.get('/datasets/:id/mitigated-dataset', (req, res) => {
  try {
    const db = getDb();
    const dataset = db.prepare('SELECT id, name, file_type, config, data_blob FROM fairness_datasets WHERE id = ?').get(req.params.id);
    if (!dataset) return res.status(404).json({ error: 'NOT_FOUND' });

    const mitigationReport = getLatestMitigationReport(db, req.params.id);
    if (!mitigationReport?.config?.group_thresholds) {
      return res.status(404).json({ error: 'NO_MITIGATION' });
    }

    const config = safeJsonParse(dataset.config, {});
    const rows = safeJsonParse(dataset.data_blob, []);
    const { adjustedRows } = applyMitigationToRows(rows, config, mitigationReport.config);

    const fmt = String(req.query.format || 'json').toLowerCase();
    const baseName = sanitizeString(dataset.name || 'mitigated', 80).replace(/\s+/g, '_');

    if (fmt === 'csv') {
      const csv = toCsv(adjustedRows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_mitigated.csv"`);
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}_mitigated.json"`);
    return res.send(JSON.stringify(adjustedRows, null, 2));
  } catch (err) {
    console.error('[ENTERPRISE] Download error:', err.message);
    return res.status(500).json({ error: 'DOWNLOAD_FAILED', message: err.message });
  }
});

// ───────────────────────────────────────────────────────────
// GET /datasets/:id/report — Get latest report
// ───────────────────────────────────────────────────────────
router.get('/datasets/:id/report', async (req, res) => {
  try {
    const db = getDb();
    const report = await getLatestReport(db, req.params.id);
    if (!report) return res.status(404).json({ error: 'NO_REPORT' });
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: 'GET_REPORT_FAILED', message: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────

function extractRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  for (const key of ['data', 'rows', 'records', 'items', 'results']) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return null;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => {
      const v = row[h] ?? '';
      return String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    }).join(','));
  }
  return lines.join('\n');
}

export default router;
