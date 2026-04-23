const SIGNAL_WEIGHTS = {
  unauthorized_service_attempt: 40,
  replay_token_usage: 25,
  escalation_verb_mismatch: 20,
  fairness_gate_violation: 15,
  repeated_anomaly_burst: 10,
};

function clampScore(value) {
  return Math.max(0, Math.min(100, value));
}

function hasAnomalyBurst(auditLog = []) {
  const recent = auditLog
    .slice(-12)
    .filter((entry) => ['FLAGGED', 'REPLAY_REJECTED', 'SUPERVISOR_PAUSED', 'SUPERVISOR_KILLED'].includes(entry.event_type));
  return recent.length >= 3;
}

export function computeRisk({ signalInput = {}, auditLog = [] } = {}) {
  const reasons = [];
  let score = 0;

  for (const [signal, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    if (signalInput[signal]) {
      score += weight;
      reasons.push({
        signal,
        weight,
        message: `Detected ${signal.replaceAll('_', ' ')}.`,
      });
    }
  }

  if (!signalInput.repeated_anomaly_burst && hasAnomalyBurst(auditLog)) {
    score += SIGNAL_WEIGHTS.repeated_anomaly_burst;
    reasons.push({
      signal: 'repeated_anomaly_burst',
      weight: SIGNAL_WEIGHTS.repeated_anomaly_burst,
      message: 'Detected repeated anomaly burst in this workflow.',
    });
  }

  return {
    riskScore: clampScore(score),
    reasons,
  };
}

export function decideAction(score, context = {}) {
  if (context.forceKill) return 'kill';
  if (score >= 70) return 'kill';
  if (score >= 40) return 'pause';
  return 'allow';
}
