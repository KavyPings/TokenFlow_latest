// ═══════════════════════════════════════════════════════════
// Demo Routes — Reset and seed demo state
//
// POST /api/demo/reset   — clear all state, seed fresh data
// GET  /api/demo/status  — current demo health snapshot
// GET  /api/demo/gemini  — Gemini service status
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import { getDb } from '../db/database.js';
import { workflowRunner } from '../engine/workflowRunner.js';
import { tokenEngine } from '../engine/tokenEngine.js';
import { getGeminiStatus } from '../services/geminiService.js';
import { APPLICANT_LIST } from '../data/applicants.js';

const router = Router();

// ─── GET /api/demo/status ────────────────────────────────
router.get('/status', (req, res) => {
  try {
    const db = getDb();
    const workflowCount = db.prepare('SELECT COUNT(*) as n FROM workflows').get().n;
    const tokenCount = db.prepare('SELECT COUNT(*) as n FROM tokens').get().n;
    const auditCount = db.prepare('SELECT COUNT(*) as n FROM audit_log').get().n;

    res.json({
      success: true,
      status: 'operational',
      gemini: getGeminiStatus(),
      applicants: APPLICANT_LIST.length,
      workflows: workflowCount,
      tokens: tokenCount,
      audit_events: auditCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/demo/gemini ────────────────────────────────
router.get('/gemini', (req, res) => {
  res.json({ success: true, ...getGeminiStatus() });
});

// ─── GET /api/demo/applicants ────────────────────────────
router.get('/applicants', (req, res) => {
  res.json({ success: true, applicants: APPLICANT_LIST });
});

// ─── POST /api/demo/reset ────────────────────────────────
// Wipes all workflow/token/audit state and re-seeds demo data.
// Safe to call repeatedly during a live demo.
router.post('/reset', async (req, res) => {
  try {
    const db = getDb();

    // 1. Clear all workflow and token state
    db.prepare('DELETE FROM audit_log').run();
    db.prepare('DELETE FROM tokens').run();
    db.prepare('DELETE FROM workflows').run();

    // 2. Clear testbench results (keep scenarios intact)
    try { db.prepare('DELETE FROM test_runs').run(); } catch { /* table may not exist in older DBs */ }
    try { db.prepare('DELETE FROM test_results').run(); } catch { /* table may not exist with that name */ }
    try { db.prepare('DELETE FROM testbench_runs').run(); } catch { }

    // 3. Clear ALL fairness tables in dependency order (child → parent)
    try { db.prepare('DELETE FROM fairness_impacted_cases').run(); } catch { }
    try { db.prepare('DELETE FROM fairness_mitigation_reports').run(); } catch { }
    try { db.prepare('DELETE FROM fairness_gate_decisions').run(); } catch { }
    try { db.prepare('DELETE FROM fairness_review_queue').run(); } catch { }
    try { db.prepare('DELETE FROM fairness_reports').run(); } catch { }
    try { db.prepare('DELETE FROM fairness_audit_logs').run(); } catch { }
    try { db.prepare('DELETE FROM fairness_datasets').run(); } catch { }

    // 4. Reset in-memory state in workflowRunner
    workflowRunner.clearWorkflows({ workflowTypes: ['mission', 'testbench', 'upload'], statuses: ['completed', 'aborted', 'running', 'paused'] });

    console.log('[DEMO] ✓ State reset complete');

    res.json({
      success: true,
      message: 'Demo state reset. All workflows, tokens, and audit events cleared.',
      applicants: APPLICANT_LIST.map(a => ({ id: a.id, name: a.name, loan_purpose: a.loan_purpose })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[DEMO] Reset failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
