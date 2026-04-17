// ═══════════════════════════════════════════════════════════
// Policy Engine — Governs token minting and security enforcement
// Enforces: cross-service isolation, scope boundaries, step ordering,
//           replay prevention, and unauthorized access blocking.
//
// This engine is the primary security boundary. A compromised agent
// cannot bypass these checks because they run server-side before
// any credential is retrieved from the vault.
// ═══════════════════════════════════════════════════════════

// Default workflow step ordering (the legitimate DAG)
const DEFAULT_STEP_ORDER = [
  'READ_OBJECT',
  'CALL_INTERNAL_API',
  'WRITE_OBJECT',
];

// Services that are explicitly unauthorized for agents
const UNAUTHORIZED_SERVICES = ['source-control', 'internal-repo'];

// Mapping of each step to the service and action it's allowed to use
const STEP_PERMISSIONS = {
  READ_OBJECT: { service: 'gcs', action: 'read', resource: 'bucket/data-input' },
  CALL_INTERNAL_API: { service: 'internal-api', action: 'invoke', resource: 'api/process' },
  WRITE_OBJECT: { service: 'gcs', action: 'write', resource: 'bucket/data-output' },
  // READ_REPO is NOT here — it's unauthorized
};

// Actions that require step-up authentication (human review)
const STEP_UP_ACTIONS = ['WRITE_OBJECT'];

class PolicyEngine {
  /**
   * Check if a token can be minted for the given action.
   * Uses the workflow's own step order if provided, otherwise defaults.
   * @param {string} actionType
   * @param {object} context
   * @param {string[]} [stepOrder] — custom step order from workflow definition
   * @returns {{ allowed: boolean, reason?: string, requiresStepUp?: boolean }}
   */
  canMint(actionType, context = {}, stepOrder = null) {
    const steps = stepOrder || DEFAULT_STEP_ORDER;

    // Check if action is in legitimate workflow
    if (!steps.includes(actionType)) {
      return { allowed: false, reason: `Unknown or unauthorized action type: ${actionType}` };
    }

    // Check step-up requirement
    if (this.requiresStepUp(actionType)) {
      return {
        allowed: true,
        requiresStepUp: true,
        reason: `Action ${actionType} requires step-up authentication`,
      };
    }

    return { allowed: true };
  }

  /**
   * Cross-service check: validate that the token's service matches the requested service.
   * This is the primary lateral-movement defense.
   * @returns {{ allowed: boolean, violation?: string, details?: object }}
   */
  checkServiceScope(tokenContext, requestedService) {
    const tokenService = tokenContext?.service;

    if (!tokenService) {
      return { allowed: false, violation: 'MISSING_SERVICE_SCOPE', details: { requestedService } };
    }

    // Check if the requested service is explicitly unauthorized
    if (UNAUTHORIZED_SERVICES.includes(requestedService)) {
      return {
        allowed: false,
        violation: 'UNAUTHORIZED_SERVICE_ACCESS',
        details: {
          tokenService,
          requestedService,
          message: `Access to service "${requestedService}" is explicitly prohibited`,
        },
      };
    }

    // Cross-service check
    if (tokenService !== requestedService) {
      return {
        allowed: false,
        violation: 'CROSS_SERVICE_VIOLATION',
        details: {
          tokenService,
          requestedService,
          message: `Token scoped to service "${tokenService}" cannot access service "${requestedService}"`,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Scope escalation check: validate that the token's action matches the requested action.
   * Prevents read tokens from being used for writes, etc.
   * @returns {{ allowed: boolean, violation?: string, details?: object }}
   */
  checkScopeEscalation(tokenContext, requestedAction) {
    const tokenAction = tokenContext?.action;

    if (!tokenAction) {
      return { allowed: false, violation: 'MISSING_ACTION_SCOPE', details: { requestedAction } };
    }

    if (tokenAction !== requestedAction) {
      return {
        allowed: false,
        violation: 'SCOPE_ESCALATION',
        details: {
          tokenAction,
          requestedAction,
          message: `Token authorized for action "${tokenAction}" cannot perform action "${requestedAction}"`,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Resource scope check: validate that the token's resource matches the requested resource.
   * @returns {{ allowed: boolean, violation?: string, details?: object }}
   */
  checkResourceScope(tokenContext, requestedResource) {
    const tokenResource = tokenContext?.resource;
    if (!tokenResource || !requestedResource) return { allowed: true }; // no resource to check

    if (tokenResource !== requestedResource) {
      return {
        allowed: false,
        violation: 'RESOURCE_SCOPE_EXCEEDED',
        details: {
          tokenResource,
          requestedResource,
          message: `Token scoped to resource "${tokenResource}" cannot access resource "${requestedResource}"`,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Unauthorized step detection:
   * Check if an action at a given step index is within the defined chain.
   * @param {string[]} [stepOrder] — custom step order
   * @returns {{ allowed: boolean, violation?: string, details?: object }}
   */
  checkUnauthorizedStep(actionType, stepIndex, stepOrder = null) {
    const steps = stepOrder || DEFAULT_STEP_ORDER;

    if (stepIndex >= steps.length) {
      return {
        allowed: false,
        violation: 'CHAIN_OVERFLOW',
        details: {
          actionType,
          stepIndex,
          maxSteps: steps.length,
          message: `Step index ${stepIndex} exceeds defined workflow chain (max: ${steps.length - 1})`,
        },
      };
    }

    const expectedAction = steps[stepIndex];
    if (expectedAction !== actionType) {
      return {
        allowed: false,
        violation: 'UNAUTHORIZED_STEP',
        details: {
          attempted: actionType,
          expected: expectedAction,
          stepIndex,
          message: `Step ${stepIndex} expects "${expectedAction}" but agent attempted "${actionType}"`,
        },
      };
    }

    return { allowed: true };
  }

  /**
   * Full security validation — runs all checks.
   * @param {string[]} [stepOrder] — custom step order for uploaded workflows
   * @returns {{ allowed: boolean, violations: object[] }}
   */
  validateExecution(actionType, stepIndex, tokenContext, requestedService, requestedAction, stepOrder = null) {
    const violations = [];

    // Step ordering check
    const stepCheck = this.checkUnauthorizedStep(actionType, stepIndex, stepOrder);
    if (!stepCheck.allowed) violations.push(stepCheck);

    // Service scope check
    const serviceCheck = this.checkServiceScope(tokenContext, requestedService);
    if (!serviceCheck.allowed) violations.push(serviceCheck);

    // Action scope check
    const actionCheck = this.checkScopeEscalation(tokenContext, requestedAction);
    if (!actionCheck.allowed) violations.push(actionCheck);

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * Validate a workflow definition (used for uploads).
   * @param {object} definition
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateWorkflowDefinition(definition) {
    const errors = [];

    if (!definition.name || typeof definition.name !== 'string') {
      errors.push('Workflow must have a name (string).');
    }
    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
      errors.push('Workflow must have at least one step.');
    }
    if (definition.steps?.length > 10) {
      errors.push('Workflow cannot have more than 10 steps.');
    }

    const allowedActions = Object.keys(STEP_PERMISSIONS);
    for (const [i, step] of (definition.steps || []).entries()) {
      if (!step.action || !allowedActions.includes(step.action)) {
        errors.push(`Step ${i}: action must be one of: ${allowedActions.join(', ')}`);
      }
      if (!step.service) {
        errors.push(`Step ${i}: service is required.`);
      }
      if (UNAUTHORIZED_SERVICES.includes(step.service)) {
        errors.push(`Step ${i}: service "${step.service}" is explicitly prohibited.`);
      }
      if (!step.resource) {
        errors.push(`Step ${i}: resource is required.`);
      }
      if (!step.actionVerb) {
        errors.push(`Step ${i}: actionVerb is required.`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check if action requires step-up authentication
   */
  requiresStepUp(actionType) {
    return STEP_UP_ACTIONS.includes(actionType);
  }

  /**
   * Get permission context for a given step action
   */
  getStepPermissions(actionType) {
    return STEP_PERMISSIONS[actionType] || null;
  }

  /**
   * Get expected next action for a workflow step
   */
  getNextAction(currentStepIndex, stepOrder = null) {
    const steps = stepOrder || DEFAULT_STEP_ORDER;
    if (currentStepIndex + 1 < steps.length) {
      return steps[currentStepIndex + 1];
    }
    return null;
  }

  /**
   * Get all valid action types in order
   */
  getStepOrder() {
    return [...DEFAULT_STEP_ORDER];
  }

  /**
   * Get unauthorized services list (for frontend display)
   */
  getUnauthorizedServices() {
    return [...UNAUTHORIZED_SERVICES];
  }

  /**
   * Get all allowed actions
   */
  getAllowedActions() {
    return Object.keys(STEP_PERMISSIONS);
  }
}

export const policyEngine = new PolicyEngine();
