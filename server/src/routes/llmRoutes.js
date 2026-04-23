import { Router } from 'express';
import { z } from 'zod';
import { generateJson, getLlmProviderStatus } from '../services/llmProviderService.js';

const router = Router();

const explanationRequestSchema = z.object({
  workflowId: z.string().optional(),
  riskScore: z.number().min(0).max(100),
  signals: z.record(z.any()).optional(),
  violations: z.array(z.object({ type: z.string().optional(), message: z.string().optional() })).optional(),
});

const llmExplanationSchema = z.object({
  summary: z.string().min(12).max(280),
  recommended_action: z.enum(['allow', 'pause', 'kill']),
  confidence: z.number().min(0).max(1),
  top_reasons: z.array(z.string().min(3).max(140)).min(1).max(4),
});

function deterministicActionFromRisk(riskScore) {
  if (riskScore >= 70) return 'kill';
  if (riskScore >= 40) return 'pause';
  return 'allow';
}

function deterministicFallback({ riskScore, action, signals, violations }) {
  const signalKeys = Object.keys(signals || {});
  const violationTypes = (violations || []).map((v) => v?.type).filter(Boolean).slice(0, 3);

  const baseSummary =
    action === 'kill'
      ? 'High-risk workflow behavior detected. Automatic containment is recommended to prevent cross-service abuse.'
      : action === 'pause'
        ? 'Elevated workflow risk detected. Pause and review are recommended before execution continues.'
        : 'Risk level appears low. Continue execution while maintaining audit visibility.';

  const reasons = [
    `Risk score evaluated at ${riskScore}/100.`,
    signalKeys.length > 0
      ? `Signals observed: ${signalKeys.slice(0, 3).join(', ')}.`
      : 'No additional risk signals supplied.',
    violationTypes.length > 0
      ? `Violations observed: ${violationTypes.join(', ')}.`
      : 'No explicit violation types supplied.',
  ];

  return {
    summary: baseSummary,
    recommended_action: action,
    confidence: 0.66,
    top_reasons: reasons,
  };
}

function buildSupervisorPrompt({ workflowId, riskScore, deterministicAction, signals, violations }) {
  return `You are a security orchestration assistant for TokenFlow.

You must explain a workflow risk evaluation in concise, factual terms.

Inputs:
- Workflow ID: ${workflowId || 'unknown'}
- Risk score: ${riskScore}
- Deterministic enforced action: ${deterministicAction}
- Signals: ${JSON.stringify(signals || {}, null, 2)}
- Violations: ${JSON.stringify(violations || [], null, 2)}

Critical rule:
- Your recommended_action MUST be exactly "${deterministicAction}".

Return ONLY valid JSON with this exact shape:
{
  "summary": "short explanation",
  "recommended_action": "allow|pause|kill",
  "confidence": 0.0,
  "top_reasons": ["reason 1", "reason 2"]
}`;
}

router.get('/status', (req, res) => {
  res.json({ success: true, ...getLlmProviderStatus() });
});

router.post('/supervisor/explain', async (req, res) => {
  const parsed = explanationRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REQUEST',
      details: parsed.error.flatten(),
    });
  }

  const { workflowId, riskScore, signals = {}, violations = [] } = parsed.data;
  const deterministic_action = deterministicActionFromRisk(riskScore);
  const providerStatus = getLlmProviderStatus();

  if (!providerStatus.api_key_configured) {
    return res.json({
      success: true,
      llm_used: false,
      fallback: true,
      provider: providerStatus.provider,
      model: providerStatus.active_model,
      deterministic_action,
      explanation: deterministicFallback({ riskScore, action: deterministic_action, signals, violations }),
      note: 'Set GEMINI_API_KEY to enable LLM-generated explanations.',
    });
  }

  const prompt = buildSupervisorPrompt({
    workflowId,
    riskScore,
    deterministicAction: deterministic_action,
    signals,
    violations,
  });

  const llm = await generateJson({ prompt });
  if (!llm.ok) {
    return res.json({
      success: true,
      llm_used: false,
      fallback: true,
      provider: providerStatus.provider,
      model: providerStatus.active_model,
      deterministic_action,
      explanation: deterministicFallback({ riskScore, action: deterministic_action, signals, violations }),
      llm_error: llm.error,
    });
  }

  const parsedExplanation = llmExplanationSchema.safeParse(llm.json);
  if (!parsedExplanation.success) {
    return res.json({
      success: true,
      llm_used: false,
      fallback: true,
      provider: llm.provider,
      model: llm.model,
      deterministic_action,
      explanation: deterministicFallback({ riskScore, action: deterministic_action, signals, violations }),
      llm_error: 'LLM output did not match expected schema.',
    });
  }

  const explanation = parsedExplanation.data;
  explanation.recommended_action = deterministic_action;

  return res.json({
    success: true,
    llm_used: true,
    fallback: false,
    provider: llm.provider,
    model: llm.model,
    deterministic_action,
    explanation,
  });
});

export default router;
