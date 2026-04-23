import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { workflowRunner } from '../engine/workflowRunner.js';
import { tokenEngine } from '../engine/tokenEngine.js';

const router = Router();

function parseDate(value) {
  const ms = Date.parse(value || '');
  return Number.isNaN(ms) ? null : ms;
}

function buildTimeline(workflowId) {
  const chain = tokenEngine.getTokenChain(workflowId);
  const audit = tokenEngine.getAuditLog(workflowId);

  const chainEvents = chain.map((token) => ({
    source: 'token_chain',
    timestamp: token.minted_at,
    event_type: 'TOKEN_MINTED',
    token_id: token.id,
    detail: {
      action: token.action_type,
      resource: token.resource_id,
      status: token.status,
      step_index: token.step_index,
    },
  }));

  const auditEvents = audit.map((entry) => ({
    source: 'audit_log',
    timestamp: entry.timestamp,
    event_type: entry.event_type,
    token_id: entry.token_id,
    detail: entry.details || {},
  }));

  return [...chainEvents, ...auditEvents]
    .filter((event) => Boolean(event.timestamp))
    .sort((a, b) => (parseDate(a.timestamp) || 0) - (parseDate(b.timestamp) || 0));
}

function buildControlMapping() {
  return [
    {
      control: 'Credential isolation',
      claim: 'Credentials stay behind vault proxy boundary.',
      evidence: ['Vault credential registry present', 'No raw secrets in token context'],
    },
    {
      control: 'Least privilege',
      claim: 'Each token is action scoped and single use.',
      evidence: ['MINTED/ACTIVATED/BURNED trail', 'FLAGGED escalation and unauthorized service events'],
    },
    {
      control: 'Detection and response',
      claim: 'Supervisor contains risky behavior quickly.',
      evidence: ['SUPERVISOR_EVALUATED events', 'SUPERVISOR_PAUSED/SUPERVISOR_KILLED events'],
    },
    {
      control: 'Auditability',
      claim: 'Workflow is replayable from immutable timeline.',
      evidence: ['Ordered audit timeline', 'Token chain linkage'],
    },
  ];
}

function buildCompliancePayload(workflowId) {
  const workflow = workflowRunner.getWorkflow(workflowId);
  if (!workflow) return null;
  const timeline = buildTimeline(workflowId);
  const supervisorDecisions = timeline.filter((event) =>
    ['SUPERVISOR_EVALUATED', 'SUPERVISOR_PAUSED', 'SUPERVISOR_KILLED'].includes(event.event_type)
  );
  const violations = timeline.filter((event) =>
    ['FLAGGED', 'REPLAY_REJECTED'].includes(event.event_type)
  );
  const containment_event = timeline.find((event) =>
    ['SUPERVISOR_PAUSED', 'SUPERVISOR_KILLED'].includes(event.event_type)
  ) || null;

  return {
    generated_at: new Date().toISOString(),
    workflow: {
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      current_step: workflow.current_step,
      created_at: workflow.created_at,
      updated_at: workflow.updated_at,
    },
    supervisor_decisions: supervisorDecisions,
    violations,
    containment_event,
    timeline,
    controls_mapping: buildControlMapping(),
  };
}

router.get('/export/:workflowId', (req, res) => {
  const { workflowId } = req.params;
  const format = String(req.query.format || 'json').toLowerCase();
  const payload = buildCompliancePayload(workflowId);

  if (!payload) {
    return res.status(404).json({ error: 'Workflow not found' });
  }

  if (format === 'pdf') {
    const doc = new PDFDocument({ margin: 44 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="compliance-${workflowId}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('TokenFlow Compliance Packet');
    doc.moveDown(0.25);
    doc.fontSize(10).text(`Workflow ID: ${payload.workflow.id}`);
    doc.text(`Workflow: ${payload.workflow.name}`);
    doc.text(`Status: ${payload.workflow.status}`);
    doc.text(`Generated at: ${payload.generated_at}`);
    doc.moveDown();

    doc.fontSize(12).text('Supervisor and Containment');
    doc.fontSize(10).text(`Supervisor events: ${payload.supervisor_decisions.length}`);
    doc.text(`Violations observed: ${payload.violations.length}`);
    doc.text(`Containment event: ${payload.containment_event?.event_type || 'none'}`);
    doc.moveDown();

    doc.fontSize(12).text('Control Mapping');
    for (const row of payload.controls_mapping) {
      doc.moveDown(0.35);
      doc.fontSize(10).text(`- ${row.control}: ${row.claim}`);
    }

    doc.end();
    return undefined;
  }

  return res.json({
    success: true,
    ...payload,
  });
});

router.get('/:workflowId', (req, res) => {
  const { workflowId } = req.params;
  const workflow = workflowRunner.getWorkflow(workflowId);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }

  const timeline = buildTimeline(workflowId);
  const containment_event = timeline.find((event) =>
    ['SUPERVISOR_PAUSED', 'SUPERVISOR_KILLED', 'FLAGGED'].includes(event.event_type)
  ) || null;

  return res.json({
    success: true,
    workflow,
    timeline,
    containment_event,
  });
});

export default router;
