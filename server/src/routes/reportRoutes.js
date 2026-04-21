import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { getDb } from '../db/database.js';

const router = Router();

router.get('/pdf', (req, res) => {
  const db = getDb();
  const generatedAt = new Date().toISOString();
  const workflowStats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) AS paused,
      SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) AS aborted
    FROM workflows
  `).get();
  const tokenStats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'burned' THEN 1 ELSE 0 END) AS burned,
      SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) AS flagged,
      SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) AS revoked
    FROM tokens
  `).get();
  const fairnessOpen = db.prepare(`
    SELECT COUNT(*) AS open_count
    FROM fairness_review_queue
    WHERE status IN ('open', 'acknowledged')
  `).get();
  const recentEvents = db.prepare(`
    SELECT event_type, actor, timestamp
    FROM audit_log
    ORDER BY id DESC
    LIMIT 8
  `).all();

  const document = new PDFDocument({ margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=\"tokenflow-audit-${Date.now()}.pdf\"`);
  document.pipe(res);

  document.fontSize(22).text('TokenFlow Security Audit Report');
  document.moveDown(0.25);
  document.fontSize(10).fillColor('#555').text(`Generated at: ${generatedAt}`);
  document.fillColor('#000');
  document.moveDown();

  document.fontSize(14).text('Workflow Summary');
  document.fontSize(11).text(`Total workflows: ${workflowStats.total || 0}`);
  document.text(`Completed: ${workflowStats.completed || 0}`);
  document.text(`Paused for review: ${workflowStats.paused || 0}`);
  document.text(`Aborted: ${workflowStats.aborted || 0}`);
  document.moveDown();

  document.fontSize(14).text('Token Integrity');
  document.fontSize(11).text(`Total tokens minted: ${tokenStats.total || 0}`);
  document.text(`Burned (single-use complete): ${tokenStats.burned || 0}`);
  document.text(`Flagged (security intervention): ${tokenStats.flagged || 0}`);
  document.text(`Revoked: ${tokenStats.revoked || 0}`);
  document.moveDown();

  document.fontSize(14).text('Fairness Queue');
  document.fontSize(11).text(`Open / acknowledged fairness items: ${fairnessOpen.open_count || 0}`);
  document.moveDown();

  document.fontSize(14).text('Recent Security Events');
  document.moveDown(0.5);
  if (recentEvents.length === 0) {
    document.fontSize(11).text('No audit events recorded yet.');
  } else {
    for (const event of recentEvents) {
      document.fontSize(10).text(`${event.timestamp} - ${event.event_type} (${event.actor})`);
    }
  }

  document.end();
});

export default router;

