// Workflow Schema & Validation for uploaded workflows

import { policyEngine } from './policyEngine.js';

/**
 * JSON schema reference for uploaded workflow definitions.
 * Returned by GET /api/workflows/schema for client-side validation.
 */
export const WORKFLOW_SCHEMA = {
  type: 'object',
  required: ['name', 'steps'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Human-readable name for the workflow',
    },
    description: {
      type: 'string',
      maxLength: 500,
      description: 'Optional description of what the workflow does',
    },
    agent: {
      type: 'string',
      default: 'agent-cloud-worker',
      description: 'Agent identity to run this workflow',
    },
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        required: ['action', 'service', 'resource', 'actionVerb'],
        properties: {
          action: {
            type: 'string',
            enum: ['READ_OBJECT', 'CALL_INTERNAL_API', 'FAIRNESS_CHECK', 'WRITE_OBJECT', 'SEND_EMAIL', 'WRITE_AUDIT_LOG'],
          },
          service: {
            type: 'string',
            enum: ['gcs', 'internal-api', 'fairness-engine', 'email', 'audit-log'],
          },
          resource: { type: 'string' },
          actionVerb: {
            type: 'string',
            enum: ['read', 'invoke', 'evaluate', 'write', 'send'],
          },
        },
      },
    },
    malicious: { type: 'boolean' },
    malicious_step: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['READ_REPO'] },
        service: { type: 'string' },
        resource: { type: 'string' },
        actionVerb: { type: 'string', enum: ['read'] },
      },
    },
    replay: { type: 'boolean' },
    escalation: { type: 'boolean' },
    escalation_step: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['WRITE_OBJECT'] },
        service: { type: 'string' },
        resource: { type: 'string' },
        actionVerb: { type: 'string', enum: ['write'] },
      },
    },
    kill_at_step: { type: 'integer', minimum: 0 },
    pause_at_step: { type: 'integer', minimum: 0 },
    approved_steps: { type: 'array', items: { type: 'integer', minimum: 0 } },
    enforce_fairness_gate: { type: 'boolean' },
  },
};

/**
 * Validate a workflow definition against the schema.
 * @param {object} definition
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWorkflow(definition) {
  const errors = [];

  if (!definition || typeof definition !== 'object') {
    return { valid: false, errors: ['Workflow must be a valid JSON object.'] };
  }

  if (!definition.name || typeof definition.name !== 'string') {
    errors.push('name is required and must be a string.');
  } else if (definition.name.length < 1 || definition.name.length > 100) {
    errors.push('name must be between 1 and 100 characters.');
  }

  if (definition.description && typeof definition.description !== 'string') {
    errors.push('description must be a string.');
  }

  if (definition.malicious !== undefined && typeof definition.malicious !== 'boolean') {
    errors.push('malicious must be a boolean when provided.');
  }
  if (definition.replay !== undefined && typeof definition.replay !== 'boolean') {
    errors.push('replay must be a boolean when provided.');
  }
  if (definition.escalation !== undefined && typeof definition.escalation !== 'boolean') {
    errors.push('escalation must be a boolean when provided.');
  }
  if (definition.enforce_fairness_gate !== undefined && typeof definition.enforce_fairness_gate !== 'boolean') {
    errors.push('enforce_fairness_gate must be a boolean when provided.');
  }
  if (definition.kill_at_step !== undefined && (!Number.isInteger(definition.kill_at_step) || definition.kill_at_step < 0)) {
    errors.push('kill_at_step must be a non-negative integer when provided.');
  }
  if (definition.pause_at_step !== undefined && (!Number.isInteger(definition.pause_at_step) || definition.pause_at_step < 0)) {
    errors.push('pause_at_step must be a non-negative integer when provided.');
  }
  if (definition.approved_steps !== undefined) {
    if (!Array.isArray(definition.approved_steps)) {
      errors.push('approved_steps must be an array of non-negative integers when provided.');
    } else if (!definition.approved_steps.every((idx) => Number.isInteger(idx) && idx >= 0)) {
      errors.push('approved_steps must contain only non-negative integers.');
    }
  }

  if (definition.malicious_step !== undefined) {
    const ms = definition.malicious_step;
    if (!ms || typeof ms !== 'object') {
      errors.push('malicious_step must be an object when provided.');
    } else {
      if (ms.action !== 'READ_REPO') errors.push('malicious_step.action must be READ_REPO.');
      if (!ms.service || typeof ms.service !== 'string') errors.push('malicious_step.service is required and must be a string.');
      if (!ms.resource || typeof ms.resource !== 'string') errors.push('malicious_step.resource is required and must be a string.');
      if (ms.actionVerb !== 'read') errors.push('malicious_step.actionVerb must be read.');
    }
  }

  if (definition.escalation_step !== undefined) {
    const es = definition.escalation_step;
    if (!es || typeof es !== 'object') {
      errors.push('escalation_step must be an object when provided.');
    } else {
      if (es.action !== 'WRITE_OBJECT') errors.push('escalation_step.action must be WRITE_OBJECT.');
      if (!es.service || typeof es.service !== 'string') errors.push('escalation_step.service is required and must be a string.');
      if (!es.resource || typeof es.resource !== 'string') errors.push('escalation_step.resource is required and must be a string.');
      if (es.actionVerb !== 'write') errors.push('escalation_step.actionVerb must be write.');
    }
  }

  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    errors.push('steps must be a non-empty array.');
  } else if (definition.steps.length > 10) {
    errors.push('steps cannot exceed 10 entries.');
  } else {
    const allowedActions = ['READ_OBJECT', 'CALL_INTERNAL_API', 'FAIRNESS_CHECK', 'WRITE_OBJECT', 'SEND_EMAIL', 'WRITE_AUDIT_LOG'];
    const allowedServices = ['gcs', 'internal-api', 'fairness-engine', 'email', 'audit-log'];
    const allowedVerbs = ['read', 'invoke', 'evaluate', 'write', 'send'];
    const actionVerbMap = {
      READ_OBJECT: 'read',
      CALL_INTERNAL_API: 'invoke',
      FAIRNESS_CHECK: 'evaluate',
      WRITE_OBJECT: 'write',
      SEND_EMAIL: 'send',
      WRITE_AUDIT_LOG: 'write',
    };
    const unauthorizedServices = policyEngine.getUnauthorizedServices();

    for (const [i, step] of definition.steps.entries()) {
      if (!step || typeof step !== 'object') {
        errors.push(`Step ${i}: must be an object.`);
        continue;
      }

      if (!step.action || !allowedActions.includes(step.action)) {
        errors.push(`Step ${i}: action must be one of: ${allowedActions.join(', ')}`);
      }
      if (!step.service || !allowedServices.includes(step.service)) {
        errors.push(`Step ${i}: service must be one of: ${allowedServices.join(', ')}`);
      }
      if (step.service && unauthorizedServices.includes(step.service)) {
        errors.push(`Step ${i}: service "${step.service}" is prohibited.`);
      }
      if (!step.resource || typeof step.resource !== 'string') {
        errors.push(`Step ${i}: resource is required and must be a string.`);
      } else if (step.resource.includes('..') || step.resource.includes('~')) {
        errors.push(`Step ${i}: resource path must not contain ".." or "~".`);
      }
      if (!step.actionVerb || !allowedVerbs.includes(step.actionVerb)) {
        errors.push(`Step ${i}: actionVerb must be one of: ${allowedVerbs.join(', ')}`);
      }
      if (step.action && step.actionVerb && actionVerbMap[step.action] !== step.actionVerb) {
        errors.push(`Step ${i}: actionVerb "${step.actionVerb}" does not match action "${step.action}" (expected "${actionVerbMap[step.action]}").`);
      }
    }
  }

  if (Array.isArray(definition.steps) && definition.steps.length > 0) {
    const maxIndex = definition.steps.length - 1;
    if (definition.kill_at_step !== undefined && Number.isInteger(definition.kill_at_step) && definition.kill_at_step > maxIndex) {
      errors.push(`kill_at_step must be within workflow step range (0-${maxIndex}).`);
    }
    if (definition.pause_at_step !== undefined && Number.isInteger(definition.pause_at_step) && definition.pause_at_step > maxIndex) {
      errors.push(`pause_at_step must be within workflow step range (0-${maxIndex}).`);
    }
    if (Array.isArray(definition.approved_steps)) {
      definition.approved_steps.forEach((idx) => {
        if (idx > maxIndex) errors.push(`approved_steps contains out-of-range index: ${idx}. Max allowed is ${maxIndex}.`);
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize a workflow definition, preserving only explicitly supported fields.
 */
export function sanitizeWorkflow(definition) {
  const safeStepIndex = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const approvedSteps = Array.isArray(definition.approved_steps)
    ? Array.from(new Set(definition.approved_steps.filter((idx) => Number.isInteger(idx) && idx >= 0))).sort((a, b) => a - b)
    : [];

  const maliciousStep = definition.malicious_step && typeof definition.malicious_step === 'object'
    ? {
      action: definition.malicious_step.action,
      service: String(definition.malicious_step.service || '').slice(0, 80).trim(),
      resource: String(definition.malicious_step.resource || '').slice(0, 200).trim(),
      actionVerb: definition.malicious_step.actionVerb,
    }
    : null;

  const escalationStep = definition.escalation_step && typeof definition.escalation_step === 'object'
    ? {
      action: definition.escalation_step.action,
      service: String(definition.escalation_step.service || '').slice(0, 80).trim(),
      resource: String(definition.escalation_step.resource || '').slice(0, 200).trim(),
      actionVerb: definition.escalation_step.actionVerb,
    }
    : null;

  return {
    name: String(definition.name || '').slice(0, 100).trim(),
    description: String(definition.description || '').slice(0, 500).trim(),
    agent: 'agent-cloud-worker',
    malicious: Boolean(definition.malicious),
    replay: Boolean(definition.replay),
    escalation: Boolean(definition.escalation),
    enforce_fairness_gate: Boolean(definition.enforce_fairness_gate),
    ...(safeStepIndex(definition.kill_at_step) !== null ? { kill_at_step: definition.kill_at_step } : {}),
    ...(safeStepIndex(definition.pause_at_step) !== null ? { pause_at_step: definition.pause_at_step } : {}),
    ...(approvedSteps.length > 0 ? { approved_steps: approvedSteps } : {}),
    ...(maliciousStep ? { malicious_step: maliciousStep } : {}),
    ...(escalationStep ? { escalation_step: escalationStep } : {}),
    steps: (definition.steps || []).map((step) => ({
      action: step.action,
      service: step.service,
      resource: String(step.resource || '').slice(0, 200).trim(),
      actionVerb: step.actionVerb,
    })),
  };
}

/**
 * Generate sample workflow templates.
 */
export function getTemplates() {
  return [
    {
      id: 'template-read-process-write',
      name: 'Read -> Process -> Write',
      description: 'Standard ETL pipeline: read data, process via API, write results.',
      definition: {
        name: 'Read -> Process -> Write Pipeline',
        description: 'Read input data from cloud storage, process through internal API, write output.',
        steps: [
          { action: 'READ_OBJECT', service: 'gcs', resource: 'input/data.json', actionVerb: 'read' },
          { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/process', actionVerb: 'invoke' },
          { action: 'WRITE_OBJECT', service: 'gcs', resource: 'output/results.json', actionVerb: 'write' },
        ],
      },
    },
    {
      id: 'template-read-only',
      name: 'Read Only Audit',
      description: 'Read-only data access for audit purposes.',
      definition: {
        name: 'Read-Only Data Audit',
        description: 'Reads data from cloud storage without modification.',
        steps: [{ action: 'READ_OBJECT', service: 'gcs', resource: 'audit/records.json', actionVerb: 'read' }],
      },
    },
    {
      id: 'template-multi-api',
      name: 'Multi-Stage Processing',
      description: 'Read, two API calls, and write.',
      definition: {
        name: 'Multi-Stage Processing',
        description: 'Reads data, runs two internal API calls, writes combined output.',
        steps: [
          { action: 'READ_OBJECT', service: 'gcs', resource: 'input/records.json', actionVerb: 'read' },
          { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/validate', actionVerb: 'invoke' },
          { action: 'CALL_INTERNAL_API', service: 'internal-api', resource: 'api/enrich', actionVerb: 'invoke' },
          { action: 'WRITE_OBJECT', service: 'gcs', resource: 'output/enriched.json', actionVerb: 'write' },
        ],
      },
    },
  ];
}
