import { computeRisk, decideAction } from '../engine/supervisorRiskModel.js';
import { tokenEngine } from '../engine/tokenEngine.js';

class OrchestrationSupervisor {
  evaluate({ workflowId, phase, signals = {}, context = {} }) {
    const auditLog = tokenEngine.getAuditLog(workflowId);
    const risk = computeRisk({ signalInput: signals, auditLog });
    const action = decideAction(risk.riskScore, context);
    const payload = {
      phase,
      risk_score: risk.riskScore,
      reasons: risk.reasons,
      signals,
      context,
      decided_action: action,
      evaluated_at: new Date().toISOString(),
    };

    tokenEngine.logWorkflowEvent(workflowId, 'SUPERVISOR_EVALUATED', payload, 'supervisor');
    return { action, ...payload };
  }
}

export const orchestrationSupervisor = new OrchestrationSupervisor();
