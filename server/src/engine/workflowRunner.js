// ═══════════════════════════════════════════════════════════
// Workflow Runner — Orchestrates the AI agent execution
// Supports: normal execution, malicious step detection,
// cross-service blocking, token chain enforcement,
// replay attacks, kill-switch, human review, and
// deterministic testbench mode.
// ═══════════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { tokenEngine } from './tokenEngine.js';
import { policyEngine } from './policyEngine.js';
import { readCloudObject, callInternalApi, writeCloudObject, sendDecisionEmail } from '../services/agentService.js';
import { broadcast } from '../websocket/wsServer.js';
import { evaluateGate, FairnessGateBlockedError } from '../fairness/services/executionGateService.js';
import { orchestrationSupervisor } from '../services/orchestrationSupervisor.js';

const AGENT_ID = 'agent-cloud-worker';

// Step execution delay (ms) — slowed for visual demo
const STEP_DELAY = 1500;

class WorkflowRunner {
  /**
   * Start a new agent workflow.
   * @param {object} taskData — scenario definition
   * @param {object} [opts] — { deterministic: bool, stepDelay: number }
   */
  async startWorkflow(taskData, opts = {}) {
    const db = getDb();
    const workflowId = `wf_${uuidv4().slice(0, 12)}`;
    const deterministic = opts.deterministic || false;
    const stepDelay = deterministic ? 50 : (opts.stepDelay || STEP_DELAY);
    const workflowType = opts.workflowType || 'mission';

    // ── FAIRNESS EXECUTION GATE ─────────────────────────────
    // Only enforced for mission workflows; testbench bypasses entirely
    if (workflowType === 'mission') {
      const gateDecision = evaluateGate(db, { triggeredBy: 'workflow_start' });
      if (!gateDecision.allowed) {
        console.log(`[WORKFLOW] 🚫 Fairness gate BLOCKED workflow start (mode: ${gateDecision.mode})`);
        throw new FairnessGateBlockedError(gateDecision);
      }
      // In shadow mode with BLOCK decision, log but proceed
      if (gateDecision.decision === 'BLOCK') {
        console.log(`[WORKFLOW] ⚠ Fairness gate would BLOCK (shadow mode) — proceeding`);
      }
    }

    db.prepare(`
      INSERT INTO workflows (id, name, status, applicant_data, workflow_type, current_step)
      VALUES (?, ?, 'running', ?, ?, 0)
    `).run(workflowId, `Agent Task — ${taskData.name}`, JSON.stringify(taskData), workflowType);

    broadcast({
      type: 'WORKFLOW_EVENT',
      payload: {
        event: 'STARTED',
        workflowId,
        taskData,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[WORKFLOW] Started ${workflowId} for task ${taskData.name}`);

    // Begin step 1 after a short delay for visual effect
    setTimeout(() => this.executeStep(workflowId, 0, { deterministic, stepDelay }), stepDelay);

    return { workflowId, status: 'running', taskData };
  }

  /**
   * Execute a specific workflow step.
   */
  async executeStep(workflowId, stepIndex, opts = {}) {
    const deterministic = opts.deterministic || false;
    const stepDelay = opts.stepDelay || STEP_DELAY;

    const workflow = this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    if (workflow.status === 'aborted' || workflow.status === 'completed') return;

    const taskData = JSON.parse(workflow.applicant_data);
    const stepDefinitions = Array.isArray(taskData.steps) && taskData.steps.length > 0
      ? taskData.steps
      : policyEngine.getStepOrder().map((action) => ({ action }));
    const stepOrder = stepDefinitions.map((step) => step.action);
    const approvedSteps = new Set(taskData.approved_steps || []);
    const writeStepIndex = stepOrder.findIndex((stepAction) => stepAction === 'WRITE_OBJECT');
    const maliciousInjectionStep = writeStepIndex >= 0 ? writeStepIndex : 2;

    // ── MALICIOUS STEP INJECTION ──────────────────────────────
    // If the task is malicious and we've just finished step 2 (CALL_INTERNAL_API),
    // inject the unauthorized READ_REPO attempt before WRITE_OBJECT
    if (taskData.malicious && stepIndex === maliciousInjectionStep && taskData.malicious_step && !approvedSteps.has(stepIndex)) {
      console.log(`[WORKFLOW] ⚠ Compromised agent attempting unauthorized step...`);
      await this._attemptMaliciousStep(workflowId, taskData, stepIndex, opts);
      return; // Execution halts — the malicious step was blocked
    }

    // ── REPLAY ATTACK ─────────────────────────────────────────
    // If the task has replay=true and we're at step 1 (after READ_OBJECT burned),
    // attempt to reuse the burned token
    if (taskData.replay && stepIndex === 1) {
      console.log(`[WORKFLOW] ⚠ Replay attack — agent attempting to reuse burned token...`);
      await this._attemptReplay(workflowId, taskData, stepIndex, opts);
      // After replay attempt is blocked, continue normally
    }

    // ── KILL SWITCH ───────────────────────────────────────────
    if (taskData.kill_at_step !== undefined && stepIndex === taskData.kill_at_step) {
      console.log(`[WORKFLOW] ⚠ Kill switch triggered at step ${stepIndex}`);
      await this.killWorkflow(workflowId);
      return;
    }

    const actionType = stepOrder[stepIndex];

    if (!actionType) {
      this._updateWorkflow(workflowId, 'completed', stepIndex);
      broadcast({ type: 'WORKFLOW_EVENT', payload: { event: 'COMPLETED', workflowId, timestamp: new Date().toISOString() } });
      console.log(`[WORKFLOW] Completed ${workflowId}`);
      return;
    }

    const beforeMintEvaluation = orchestrationSupervisor.evaluate({
      workflowId,
      phase: 'before_token_mint',
      context: { stepIndex, actionType },
    });
    if (await this._applySupervisorDecision(workflowId, beforeMintEvaluation, stepIndex)) {
      return;
    }

    // Get step permissions from policy engine
    const stepPermissions = policyEngine.getStepPermissions(actionType);
    const stepDef = stepDefinitions[stepIndex];

    // Get previous token ID for chain linking
    const chain = tokenEngine.getTokenChain(workflowId);
    const parentTokenId = chain.length > 0 ? chain[chain.length - 1].id : null;

    // Mint token for this step
    const policy = policyEngine.canMint(actionType, { taskData }, stepOrder);
    if (!policy.allowed) {
      console.error(`[WORKFLOW] Policy denied minting for ${actionType}: ${policy.reason}`);
      return;
    }

    // Token context includes service, resource, action scoping
    // Use stepDef (scenario-specific) values first, then fallback to stepPermissions
    const resourcePath = stepDef?.resource || stepPermissions?.resource;
    const tokenContext = {
      taskData: { id: taskData.id, name: taskData.name },
      stepIndex,
      service: stepDef?.service || stepPermissions?.service,
      resource: resourcePath,
      action: stepDef?.actionVerb || stepPermissions?.action,
    };

    const token = tokenEngine.mintToken(
      workflowId,
      actionType,
      resourcePath,
      AGENT_ID,
      tokenContext,
      parentTokenId,
      stepIndex
    );

    // Short delay, then activate and execute
    await this._delay(stepDelay);

    // Check workflow is still alive
    const currentWorkflow = this.getWorkflow(workflowId);
    if (currentWorkflow.status === 'aborted') return;

    // ── HUMAN REVIEW PAUSE ────────────────────────────────────
    if (taskData.pause_at_step !== undefined && stepIndex === taskData.pause_at_step && !approvedSteps.has(stepIndex)) {
      tokenEngine.activateToken(token.id);
      tokenEngine.flagToken(token.id, 'STEP_UP_REQUIRED', {
        summary: `Step ${stepIndex} (${actionType}) requires human review before execution.`,
        attempted_action: actionType,
        attempted_service: stepDef?.service || stepPermissions?.service,
        attempted_resource: stepDef?.resource || stepPermissions?.resource,
        taskData: { id: taskData.id, name: taskData.name },
      });
      this._updateWorkflow(workflowId, 'paused', stepIndex);
      console.log(`[WORKFLOW] Paused ${workflowId} at step ${stepIndex} for human review`);
      return;
    }

    tokenEngine.activateToken(token.id);
    this._updateWorkflow(workflowId, 'running', stepIndex);

    if (taskData.escalation && !approvedSteps.has(stepIndex)) {
      const escalationBlocked = await this._attemptScopeEscalation(
        workflowId,
        taskData,
        stepIndex,
        token,
        tokenContext,
        stepOrder,
        opts
      );
      if (escalationBlocked) {
        return;
      }
    }

    await this._delay(stepDelay);

    const beforeExecuteEvaluation = orchestrationSupervisor.evaluate({
      workflowId,
      phase: 'before_step_execute',
      context: { stepIndex, actionType, tokenId: token.id },
    });
    if (await this._applySupervisorDecision(workflowId, beforeExecuteEvaluation, stepIndex)) {
      return;
    }

    // Execute the step action
    try {
      const result = await this._executeAction(actionType, taskData, workflowId, token.id, stepIndex);

      // Check if security violation was flagged — pause workflow
      if (result._paused) {
        this._updateWorkflow(workflowId, 'paused', stepIndex);
        return; // Wait for human review
      }

      if (actionType === 'CALL_INTERNAL_API' && taskData.enforce_fairness_gate && !approvedSteps.has(stepIndex)) {
        const flags = result?.fairness_flags || {};
        const hasFairnessViolation = Object.values(flags).some(Boolean);
        if (hasFairnessViolation) {
          tokenEngine.flagToken(token.id, 'FAIRNESS_FLAG', {
            summary: `Protected-attribute fairness risk detected for ${taskData.applicant?.name || 'applicant'}.`,
            attempted_action: actionType,
            attempted_service: stepDef?.service || stepPermissions?.service,
            attempted_resource: stepDef?.resource || stepPermissions?.resource,
            fairness_flags: flags,
            taskData: { id: taskData.id, name: taskData.name },
          });
          const evaluation = orchestrationSupervisor.evaluate({
            workflowId,
            phase: 'post_flagged_event',
            signals: {
              fairness_gate_violation: true,
            },
            context: { stepIndex, actionType },
          });
          if (await this._applySupervisorDecision(workflowId, evaluation, stepIndex)) {
            return;
          }
          this._updateWorkflow(workflowId, 'paused', stepIndex);
          return;
        }
      }

      // Consume (burn) the token
      tokenEngine.consumeToken(token.id, result);

      // Auto-advance to next step after delay
      await this._delay(stepDelay);
      this.executeStep(workflowId, stepIndex + 1, opts);
    } catch (error) {
      console.error(`[WORKFLOW] Step ${stepIndex} failed:`, error.message);
      tokenEngine.revokeToken(token.id, `Execution failed: ${error.message}`, 'system');
      this._updateWorkflow(workflowId, 'aborted', stepIndex);
    }
  }

  /**
   * Attempt an unauthorized (malicious) step — this SHOULD be blocked.
   */
  async _attemptMaliciousStep(workflowId, taskData, stepIndex, opts = {}) {
    const stepDelay = opts.stepDelay || STEP_DELAY;
    const maliciousStep = taskData.malicious_step;
    const chain = tokenEngine.getTokenChain(workflowId);
    const parentTokenId = chain.length > 0 ? chain[chain.length - 1].id : null;

    // The compromised agent tries to mint a token for the unauthorized step
    // We mint it to show the attempt, then immediately flag it
    const tokenContext = {
      taskData: { id: taskData.id, name: taskData.name },
      stepIndex,
      service: maliciousStep.service,        // source-control (unauthorized!)
      resource: maliciousStep.resource,       // internal/secrets-config.yaml
      action: maliciousStep.actionVerb,       // read
      malicious: true,
    };

    // Mint token for the unauthorized step (to show the attempt in the chain)
    const token = tokenEngine.mintToken(
      workflowId,
      maliciousStep.action,                   // READ_REPO
      maliciousStep.resource,
      AGENT_ID,
      tokenContext,
      parentTokenId,
      stepIndex
    );

    await this._delay(stepDelay);

    // Run security validation
    const validation = policyEngine.validateExecution(
      maliciousStep.action,
      stepIndex,
      tokenContext,
      maliciousStep.service,
      maliciousStep.actionVerb
    );

    if (!validation.allowed) {
      console.log(`[WORKFLOW] 🛑 SECURITY VIOLATION DETECTED — Blocking unauthorized step`);

      // Flag the token with all violation details
      tokenEngine.flagToken(token.id, 'SECURITY_VIOLATION', {
        violations: validation.violations.map(v => ({
          type: v.violation,
          ...v.details,
        })),
        summary: `Unauthorized cross-service access detected: Agent attempted to access "${maliciousStep.service}" service to read "${maliciousStep.resource}"`,
        attempted_action: maliciousStep.action,
        attempted_service: maliciousStep.service,
        attempted_resource: maliciousStep.resource,
        taskData: { id: taskData.id, name: taskData.name },
      });

      const evaluation = orchestrationSupervisor.evaluate({
        workflowId,
        phase: 'post_flagged_event',
        signals: {
          unauthorized_service_attempt: true,
        },
        context: {
          stepIndex,
          attempted_action: maliciousStep.action,
          attempted_service: maliciousStep.service,
        },
      });
      if (await this._applySupervisorDecision(workflowId, evaluation, stepIndex)) {
        return;
      }

      this._updateWorkflow(workflowId, 'paused', stepIndex);
      return;
    }
  }

  /**
   * Attempt a replay attack — reuse a burned token.
   */
  async _attemptReplay(workflowId, taskData, stepIndex, opts = {}) {
    const stepDelay = opts.stepDelay || STEP_DELAY;
    const chain = tokenEngine.getTokenChain(workflowId);
    const burnedToken = chain.find(t => t.status === 'burned');

    if (burnedToken) {
      try {
        // Agent tries to consume the already-burned token
        tokenEngine.consumeToken(burnedToken.id, { replay_attempt: true });
      } catch (err) {
        console.log(`[WORKFLOW] 🛑 REPLAY BLOCKED: ${err.message}`);
        const evaluation = orchestrationSupervisor.evaluate({
          workflowId,
          phase: 'post_flagged_event',
          signals: {
            replay_token_usage: true,
          },
          context: { stepIndex, replayRejected: true },
        });
        const halted = await this._applySupervisorDecision(workflowId, evaluation, stepIndex);
        if (halted) {
          return;
        }
        // Replay was blocked — continue with normal flow
      }
      await this._delay(stepDelay);
    }
  }

  /**
   * Attempt a scope escalation using the currently active token.
   */
  async _attemptScopeEscalation(workflowId, taskData, stepIndex, token, tokenContext, stepOrder, opts = {}) {
    const stepDelay = opts.stepDelay || STEP_DELAY;
    const escalationStep = taskData.escalation_step || {
      action: 'WRITE_OBJECT',
      service: tokenContext.service,
      resource: tokenContext.resource,
      actionVerb: 'write',
    };

    await this._delay(stepDelay);

    const validation = policyEngine.validateExecution(
      escalationStep.action,
      stepIndex,
      tokenContext,
      escalationStep.service,
      escalationStep.actionVerb,
      stepOrder
    );

    if (!validation.allowed) {
      console.log(`[WORKFLOW] Scope escalation detected — blocking token misuse`);

      tokenEngine.flagToken(token.id, 'SCOPE_ESCALATION', {
        violations: validation.violations.map((violation) => ({
          type: violation.violation,
          ...violation.details,
        })),
        summary: `Scope escalation blocked: token for "${tokenContext.action}" was misused to attempt "${escalationStep.actionVerb}" on "${escalationStep.resource}"`,
        attempted_action: escalationStep.action,
        attempted_service: escalationStep.service,
        attempted_resource: escalationStep.resource,
        taskData: { id: taskData.id, name: taskData.name },
      });

      const evaluation = orchestrationSupervisor.evaluate({
        workflowId,
        phase: 'post_flagged_event',
        signals: {
          escalation_verb_mismatch: true,
        },
        context: {
          stepIndex,
          attempted_action: escalationStep.action,
          attempted_resource: escalationStep.resource,
        },
      });
      if (await this._applySupervisorDecision(workflowId, evaluation, stepIndex)) {
        return true;
      }

      this._updateWorkflow(workflowId, 'paused', stepIndex);
      return true;
    }

    return false;
  }

  /**
   * Resume a paused workflow after human review approval.
   */
  async resumeWorkflow(workflowId) {
    const db = getDb();
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    if (workflow.status !== 'paused') throw new Error(`Workflow ${workflowId} is ${workflow.status}, not paused`);

    const taskData = JSON.parse(workflow.applicant_data);
    const approvedSteps = new Set(taskData.approved_steps || []);
    approvedSteps.add(workflow.current_step);
    taskData.approved_steps = [...approvedSteps];
    this._updateWorkflowTaskData(workflowId, taskData);

    // Find the flagged token and burn it with review result
    const chain = tokenEngine.getTokenChain(workflowId);
    const flaggedToken = chain.find(t => t.status === 'flagged');

    if (flaggedToken) {
      // Reactivate and consume the flagged token
      const tDb = getDb();
      tDb.prepare(`UPDATE tokens SET status = 'active' WHERE id = ?`).run(flaggedToken.id);
      tokenEngine.consumeToken(flaggedToken.id, { review: 'approved', reviewer: 'human' });
    }

    this._updateWorkflow(workflowId, 'running', workflow.current_step);

    broadcast({
      type: 'WORKFLOW_EVENT',
      payload: {
        event: 'RESUMED',
        workflowId,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[WORKFLOW] Resumed ${workflowId}`);

    // Continue to the next legitimate step (skip the malicious one)
    await this._delay(STEP_DELAY);

    const resumeStep = workflow.current_step;
    this.executeStep(workflowId, resumeStep);

    return { workflowId, status: 'running' };
  }

  /**
   * Abort a workflow after human review rejection.
   */
  async abortWorkflow(workflowId) {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    // Revoke all active tokens
    tokenEngine.revokeAllActive(workflowId);
    this._updateWorkflow(workflowId, 'aborted', workflow.current_step);

    broadcast({
      type: 'WORKFLOW_EVENT',
      payload: {
        event: 'ABORTED',
        workflowId,
        reason: 'Human reviewer rejected — security violation confirmed',
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[WORKFLOW] Aborted ${workflowId}`);
    return { workflowId, status: 'aborted' };
  }

  /**
   * Kill switch — immediately revoke everything.
   */
  async killWorkflow(workflowId) {
    const revokedCount = tokenEngine.revokeAllActive(workflowId);
    this._updateWorkflow(workflowId, 'aborted', null);

    broadcast({
      type: 'WORKFLOW_EVENT',
      payload: {
        event: 'KILLED',
        workflowId,
        revokedCount,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[WORKFLOW] Killed ${workflowId} — revoked ${revokedCount} tokens`);
    return { workflowId, status: 'aborted', revokedCount };
  }

  // ─── Internal action execution ────────────────────────────

  async _executeAction(actionType, taskData, workflowId, tokenId, stepIndex) {
    const stepDef = taskData.steps?.[stepIndex];
    // Gather context from previous steps for Gemini
    const workflow = this.getWorkflow(workflowId);
    let context = {};
    try { context = JSON.parse(workflow?.step_context || '{}'); } catch { context = {}; }

    switch (actionType) {
      case 'READ_OBJECT': {
        const result = await readCloudObject(stepDef?.resource || 'default/input.json', taskData);
        // Persist context for next step
        this._persistStepContext(workflowId, { ...context, readResult: result.data });
        return result;
      }

      case 'CALL_INTERNAL_API': {
        const result = await callInternalApi(stepDef?.resource || 'api/credit/score', taskData, context);
        // Broadcast fairness flag if AI detected protected attribute risk
        const flags = result.fairness_flags || {};
        const hasFairnessRisk = Object.values(flags).some(Boolean);
        if (hasFairnessRisk) {
          broadcast({
            type: 'FAIRNESS_FLAG',
            payload: {
              workflowId,
              applicant: taskData.applicant?.name || 'Applicant',
              flags,
              score: result.data?.credit_score,
              recommendation: result.data?.recommendation,
              timestamp: new Date().toISOString(),
            },
          });
          console.log(`[WORKFLOW] ⚠ Fairness signal detected for ${taskData.applicant?.name}`);
        }
        this._persistStepContext(workflowId, { ...context, creditResult: result.data, fairnessFlags: flags });
        return result;
      }

      case 'FAIRNESS_CHECK': {
        const flags = context.fairnessFlags || {};
        const hasRisk = Object.values(flags).some(Boolean);
        const result = {
          success: true,
          action: 'FAIRNESS_CHECK',
          service: stepDef?.service || 'fairness-engine',
          resource: stepDef?.resource || 'fairness/inline',
          data: {
            has_risk: hasRisk,
            flags,
            mode: taskData.enforce_fairness_gate ? 'enforce' : 'observe',
            recommendation: hasRisk ? 'human_review' : 'clear',
          },
          message: hasRisk
            ? 'Fairness risk detected and routed to review.'
            : 'Fairness check passed with no inline risk flags.',
        };
        this._persistStepContext(workflowId, { ...context, fairnessResult: result.data });
        return result;
      }

      case 'WRITE_OBJECT': {
        const result = await writeCloudObject(stepDef?.resource || 'default/output.json', taskData, context);
        this._persistStepContext(workflowId, { ...context, decisionResult: result.data });
        // Broadcast final decision
        broadcast({
          type: 'DECISION_MADE',
          payload: {
            workflowId,
            applicant: taskData.applicant?.name || 'Applicant',
            decision: result.data?.decision,
            amount: result.data?.amount_approved,
            timestamp: new Date().toISOString(),
          },
        });
        return result;
      }

      case 'SEND_EMAIL': {
        const result = await sendDecisionEmail(
          stepDef?.resource || 'sendgrid/mail.send',
          { ...taskData, workflowId },
          context
        );
        this._persistStepContext(workflowId, { ...context, emailResult: result.data });
        return result;
      }

      case 'WRITE_AUDIT_LOG': {
        const result = {
          success: true,
          action: 'WRITE_AUDIT_LOG',
          service: stepDef?.service || 'audit-log',
          resource: stepDef?.resource || `audit/${workflowId}.json`,
          data: {
            workflow_id: workflowId,
            applicant_id: taskData.applicant?.id || null,
            decision: context.decisionResult?.decision || null,
            email_queued: Boolean(context.emailResult?.queued),
            fairness_flags: context.fairnessFlags || {},
            recorded_at: new Date().toISOString(),
          },
          message: 'Final audit record captured for loan decision workflow.',
        };
        this._persistStepContext(workflowId, { ...context, auditResult: result.data });
        return result;
      }

      default:
        throw new Error(`Unknown action: ${actionType}`);
    }
  }

  _persistStepContext(workflowId, context) {
    try {
      const db = getDb();
      // Store step context as JSON in the workflow row (reuse applicant_data column safely)
      db.prepare('UPDATE workflows SET step_context = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(context), new Date().toISOString(), workflowId);
    } catch {
      // step_context column may not exist in older schema — safe to ignore
    }
  }

  async _applySupervisorDecision(workflowId, evaluation, stepIndex) {
    if (!evaluation || evaluation.action === 'allow') return false;

    if (evaluation.action === 'kill') {
      tokenEngine.logWorkflowEvent(workflowId, 'SUPERVISOR_KILLED', evaluation, 'supervisor');
      await this.killWorkflow(workflowId);
      return true;
    }

    if (evaluation.action === 'pause') {
      tokenEngine.logWorkflowEvent(workflowId, 'SUPERVISOR_PAUSED', evaluation, 'supervisor');
      this._updateWorkflow(workflowId, 'paused', stepIndex);
      return true;
    }

    return false;
  }

  // ─── Query helpers ────────────────────────────────────────

  getWorkflow(workflowId) {
    const db = getDb();
    return db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId);
  }

  listWorkflows(options = {}) {
    const db = getDb();
    const { includeTestbench = false, workflowType = null } = options;

    if (workflowType) {
      return db.prepare(`
        SELECT * FROM workflows
        WHERE COALESCE(workflow_type, 'mission') = ?
        ORDER BY created_at DESC
      `).all(workflowType);
    }

    if (includeTestbench) {
      return db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all();
    }

    return db.prepare(`
      SELECT * FROM workflows
      WHERE COALESCE(workflow_type, 'mission') != 'testbench'
      ORDER BY created_at DESC
    `).all();
  }

  clearWorkflows(options = {}) {
    const db = getDb();
    const { workflowTypes = ['mission'], statuses = ['completed', 'aborted'] } = options;
    const workflowPlaceholders = workflowTypes.map(() => '?').join(', ');
    const statusPlaceholders = statuses.map(() => '?').join(', ');
    const workflows = db.prepare(`
      SELECT id FROM workflows
      WHERE COALESCE(workflow_type, 'mission') IN (${workflowPlaceholders})
        AND status IN (${statusPlaceholders})
        AND COALESCE(hidden_from_chain, 0) = 0
    `).all(...workflowTypes, ...statuses);

    if (workflows.length === 0) {
      return { count: 0, workflowIds: [] };
    }

    const workflowIds = workflows.map((workflow) => workflow.id);
    const hideWorkflow = db.prepare(`
      UPDATE workflows
      SET hidden_from_chain = 1, updated_at = ?
      WHERE id = ?
    `);
    const now = new Date().toISOString();

    db.transaction((ids) => {
      for (const workflowId of ids) {
        hideWorkflow.run(now, workflowId);
      }
    })(workflowIds);

    broadcast({
      type: 'WORKFLOW_EVENT',
      payload: {
        event: 'CLEARED',
        workflowIds,
        timestamp: new Date().toISOString(),
      },
    });

    return { count: workflowIds.length, workflowIds };
  }

  _updateWorkflow(workflowId, status, currentStep) {
    const db = getDb();
    const updates = { status, updated_at: new Date().toISOString() };
    if (currentStep !== null && currentStep !== undefined) {
      db.prepare('UPDATE workflows SET status = ?, current_step = ?, updated_at = ? WHERE id = ?')
        .run(status, currentStep, updates.updated_at, workflowId);
    } else {
      db.prepare('UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?')
        .run(status, updates.updated_at, workflowId);
    }
  }

  _updateWorkflowTaskData(workflowId, taskData) {
    const db = getDb();
    db.prepare('UPDATE workflows SET applicant_data = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(taskData), new Date().toISOString(), workflowId);
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const workflowRunner = new WorkflowRunner();

