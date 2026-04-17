// ═══════════════════════════════════════════════════════════
// Workflow Schema & Validation for uploaded workflows
// ═══════════════════════════════════════════════════════════

import { policyEngine } from './policyEngine.js';

/**
 * JSON schema reference for uploaded workflow definitions.
 * This is returned by GET /api/workflows/schema for client-side validation.
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
            enum: ['READ_OBJECT', 'CALL_INTERNAL_API', 'WRITE_OBJECT'],
            description: 'The capability action type',
          },
          service: {
            type: 'string',
            enum: ['gcs', 'internal-api'],
            description: 'Target service (must be authorized)',
          },
          resource: {
            type: 'string',
            description: 'Resource path the action targets',
          },
          actionVerb: {
            type: 'string',
            enum: ['read', 'invoke', 'write'],
            description: 'Action verb matching the action type',
          },
        },
      },
    },
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

  // Name validation
  if (!definition.name || typeof definition.name !== 'string') {
    errors.push('name is required and must be a string.');
  } else if (definition.name.length < 1 || definition.name.length > 100) {
    errors.push('name must be between 1 and 100 characters.');
  }

  // Description validation 
  if (definition.description && typeof definition.description !== 'string') {
    errors.push('description must be a string.');
  }

  // Steps validation
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    errors.push('steps must be a non-empty array.');
  } else if (definition.steps.length > 10) {
    errors.push('steps cannot exceed 10 entries.');
  } else {
    const allowedActions = ['READ_OBJECT', 'CALL_INTERNAL_API', 'WRITE_OBJECT'];
    const allowedServices = ['gcs', 'internal-api'];
    const allowedVerbs = ['read', 'invoke', 'write'];
    const actionVerbMap = { READ_OBJECT: 'read', CALL_INTERNAL_API: 'invoke', WRITE_OBJECT: 'write' };
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
      } else {
        // Basic path traversal protection
        if (step.resource.includes('..') || step.resource.includes('~')) {
          errors.push(`Step ${i}: resource path must not contain ".." or "~".`);
        }
      }

      if (!step.actionVerb || !allowedVerbs.includes(step.actionVerb)) {
        errors.push(`Step ${i}: actionVerb must be one of: ${allowedVerbs.join(', ')}`);
      }

      // Verify action/verb consistency
      if (step.action && step.actionVerb && actionVerbMap[step.action] !== step.actionVerb) {
        errors.push(`Step ${i}: actionVerb "${step.actionVerb}" does not match action "${step.action}" (expected "${actionVerbMap[step.action]}").`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize a workflow definition, removing potentially dangerous fields.
 */
export function sanitizeWorkflow(definition) {
  return {
    name: String(definition.name || '').slice(0, 100).trim(),
    description: String(definition.description || '').slice(0, 500).trim(),
    agent: 'agent-cloud-worker', // always override — agents cannot self-assign
    malicious: false, // uploaded workflows are never malicious
    steps: (definition.steps || []).map(step => ({
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
      name: 'Read → Process → Write',
      description: 'Standard ETL pipeline: read data, process via API, write results.',
      definition: {
        name: 'Read → Process → Write Pipeline',
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
        steps: [
          { action: 'READ_OBJECT', service: 'gcs', resource: 'audit/records.json', actionVerb: 'read' },
        ],
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
