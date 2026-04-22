// ═══════════════════════════════════════════════════════════
// Gemini Service — Real AI step execution via Gemini 1.5 Flash
//
// Each workflow step maps to a structured Gemini prompt.
// Returns typed structured JSON results, not freetext.
// Falls back to deterministic mock data when GEMINI_API_KEY is absent.
// ═══════════════════════════════════════════════════════════

const USE_REAL_GEMINI = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 10;

let genAI = null;
let model = null;

async function initGemini() {
  if (!USE_REAL_GEMINI || model) return;
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    console.log('[GEMINI] ✓ Gemini 2.5 Flash initialized');
  } catch (err) {
    console.warn('[GEMINI] Could not initialize Gemini SDK:', err.message);
  }
}

initGemini();

// ─── Loan Decision Step Prompts ─────────────────────────────

const PROMPTS = {
  READ_APPLICANT: (applicant) => `
You are a loan processing system reading an applicant record from cloud storage.

Applicant data:
${JSON.stringify(applicant, null, 2)}

Respond ONLY with a valid JSON object (no markdown, no prose) in this exact format:
{
  "status": "loaded",
  "applicant_id": "${applicant.id}",
  "name": "${applicant.name}",
  "summary": "Two-sentence summary of the applicant profile",
  "data_quality": "good" | "partial" | "incomplete",
  "flags": []
}
`,

  SCORE_CREDIT: (applicant, creditData) => `
You are a credit risk assessment model analyzing a loan application.

Applicant profile:
${JSON.stringify({ ...applicant, credit: creditData }, null, 2)}

Assess credit risk and respond ONLY with a valid JSON object (no markdown, no prose):
{
  "score": <integer 300-850>,
  "risk_tier": "low" | "medium" | "high" | "critical",
  "confidence": <float 0.0-1.0>,
  "approval_probability": <float 0.0-1.0>,
  "reasoning": "One paragraph explanation of the score",
  "protected_attribute_risk": {
    "gender_equity_flag": <boolean>,
    "zip_code_flag": <boolean>,
    "age_flag": <boolean>
  },
  "recommendation": "approve" | "review" | "decline"
}
`,

  CHECK_COMPLIANCE: (applicant, creditResult) => `
You are a compliance and fairness verification system.
A credit decision has been made for Applicant ${applicant.id}.

Credit result: ${JSON.stringify(creditResult, null, 2)}

Check regulatory compliance and respond ONLY with valid JSON:
{
  "compliant": <boolean>,
  "ecoa_risk": "low" | "medium" | "high",
  "disparate_impact_flag": <boolean>,
  "adverse_action_required": <boolean>,
  "adverse_action_reasons": [],
  "audit_note": "One sentence compliance summary"
}
`,

  WRITE_DECISION: (applicant, creditResult, complianceResult) => `
You are a loan decision writer generating an official decision record.

Applicant: ${applicant.name} (ID: ${applicant.id})
Credit Score: ${creditResult?.score}
Recommendation: ${creditResult?.recommendation}
Compliant: ${complianceResult?.compliant}

Write a formal loan decision and respond ONLY with valid JSON:
{
  "decision": "approved" | "approved_with_conditions" | "declined",
  "amount_approved": <integer or null>,
  "interest_rate": <float or null>,
  "conditions": [],
  "decline_reasons": [],
  "decision_letter": "Two-paragraph formal decision letter text",
  "decided_at": "${new Date().toISOString()}"
}
`,

  SEND_NOTIFICATION: (applicant, decision) => `
You are a notification system preparing a loan decision email.

Applicant: ${applicant.name} (${applicant.email || 'applicant@example.com'})
Decision: ${decision?.decision}

Compose a notification email and respond ONLY with valid JSON:
{
  "to": "${applicant.email || 'applicant@example.com'}",
  "subject": "Email subject line",
  "preview": "First sentence of the email",
  "send_status": "queued",
  "estimated_delivery": "${new Date(Date.now() + 60000).toISOString()}"
}
`,
};

// ─── Mock Fallback Data ────────────────────────────────────

function mockResult(action, applicant) {
  const now = new Date().toISOString();
  const score = 620 + Math.floor(Math.random() * 180);
  const risk = score >= 750 ? 'low' : score >= 650 ? 'medium' : score >= 550 ? 'high' : 'critical';
  const recommendation = score >= 680 ? 'approve' : score >= 580 ? 'review' : 'decline';

  switch (action) {
    case 'READ_APPLICANT':
    case 'READ_OBJECT':
      return {
        status: 'loaded',
        applicant_id: applicant?.id || 'APP-001',
        name: applicant?.name || 'Test Applicant',
        summary: `${applicant?.name || 'Applicant'} has ${applicant?.employment_years || 3} years of employment history and is requesting a ${applicant?.loan_purpose || 'personal'} loan of $${applicant?.loan_amount?.toLocaleString() || '25,000'}.`,
        data_quality: 'good',
        flags: [],
        _mock: true,
      };

    case 'SCORE_CREDIT':
    case 'CALL_INTERNAL_API':
      return {
        score,
        risk_tier: risk,
        confidence: 0.82 + Math.random() * 0.15,
        approval_probability: score >= 680 ? 0.78 : score >= 580 ? 0.42 : 0.12,
        reasoning: `Credit analysis based on ${applicant?.credit_history_years || 5} years of credit history. ${score >= 680 ? 'Strong payment record with manageable debt-to-income ratio.' : 'Some derogatory marks noted; elevated debt-to-income ratio requires review.'}`,
        protected_attribute_risk: {
          gender_equity_flag: Math.random() > 0.8,
          zip_code_flag: applicant?.zip && ['10001', '90210', '60601'].includes(applicant.zip),
          age_flag: applicant?.age && (applicant.age < 25 || applicant.age > 70),
        },
        recommendation,
        _mock: true,
      };

    case 'CHECK_COMPLIANCE':
      return {
        compliant: recommendation !== 'decline' || Math.random() > 0.3,
        ecoa_risk: risk === 'low' ? 'low' : risk === 'medium' ? 'medium' : 'high',
        disparate_impact_flag: Math.random() > 0.75,
        adverse_action_required: recommendation === 'decline',
        adverse_action_reasons: recommendation === 'decline'
          ? ['Insufficient credit history', 'High debt-to-income ratio']
          : [],
        audit_note: `Compliance review completed at ${now}. ${recommendation === 'decline' ? 'Adverse action notices required.' : 'No adverse action required.'}`,
        _mock: true,
      };

    case 'WRITE_DECISION':
    case 'WRITE_OBJECT':
      return {
        decision: score >= 720 ? 'approved' : score >= 640 ? 'approved_with_conditions' : 'declined',
        amount_approved: score >= 640 ? (applicant?.loan_amount || 25000) : null,
        interest_rate: score >= 720 ? 6.4 : score >= 640 ? 8.9 : null,
        conditions: score >= 640 && score < 720 ? ['Proof of stable income required', 'Co-signer recommended'] : [],
        decline_reasons: score < 640 ? ['Credit score below minimum threshold', 'Debt-to-income ratio exceeds limit'] : [],
        decision_letter: `Dear ${applicant?.name || 'Applicant'},\n\nThank you for your loan application. After careful review, we have ${score >= 640 ? `approved your request for $${(applicant?.loan_amount || 25000).toLocaleString()} at ${score >= 720 ? 6.4 : 8.9}% APR` : 'been unable to approve your application at this time'}.\n\n${score >= 640 ? 'Your TokenFlow-verified decision record is available in your secure portal.' : 'You have the right to know why your application was not approved. Please contact us for an adverse action notice.'}`,
        decided_at: now,
        _mock: true,
      };

    case 'SEND_NOTIFICATION':
      return {
        to: applicant?.email || `${(applicant?.name || 'applicant').toLowerCase().replace(/\s/g, '.')}@example.com`,
        subject: `Your Loan Application Decision — ${applicant?.id || 'APP-001'}`,
        preview: `Dear ${applicant?.name || 'Applicant'}, your loan application has been processed.`,
        send_status: 'queued',
        estimated_delivery: new Date(Date.now() + 60000).toISOString(),
        _mock: true,
      };

    default:
      return { status: 'completed', action, _mock: true };
  }
}

// ─── Main Export ───────────────────────────────────────────

/**
 * Execute a workflow step using Gemini or deterministic mock.
 *
 * @param {string} action — e.g. 'READ_APPLICANT', 'SCORE_CREDIT'
 * @param {object} applicant — applicant profile from scenario
 * @param {object} context — previous step results { creditResult, complianceResult, etc. }
 * @returns {Promise<object>} structured result object
 */
export async function runGeminiStep(action, applicant, context = {}) {
  const startMs = Date.now();

  if (!USE_REAL_GEMINI || !model) {
    // Deterministic mock — still realistic, varies by applicant
    const result = mockResult(action, applicant);
    console.log(`[GEMINI] Mock ${action} for ${applicant?.name || 'applicant'} (${Date.now() - startMs}ms)`);
    return { ...result, latency_ms: Date.now() - startMs };
  }

  // Real Gemini call
  let prompt;
  switch (action) {
    case 'READ_APPLICANT':
    case 'READ_OBJECT':
      prompt = PROMPTS.READ_APPLICANT(applicant);
      break;
    case 'SCORE_CREDIT':
    case 'CALL_INTERNAL_API':
      prompt = PROMPTS.SCORE_CREDIT(applicant, context.previousResult);
      break;
    case 'CHECK_COMPLIANCE':
      prompt = PROMPTS.CHECK_COMPLIANCE(applicant, context.creditResult || context.previousResult);
      break;
    case 'WRITE_DECISION':
    case 'WRITE_OBJECT':
      prompt = PROMPTS.WRITE_DECISION(applicant, context.creditResult, context.complianceResult);
      break;
    case 'SEND_NOTIFICATION':
      prompt = PROMPTS.SEND_NOTIFICATION(applicant, context.decision || context.previousResult);
      break;
    default:
      return mockResult(action, applicant);
  }

  try {
    const geminiResult = await model.generateContent(prompt);
    const text = geminiResult.response.text().trim();

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    console.log(`[GEMINI] ✓ Real ${action} for ${applicant?.name} (${Date.now() - startMs}ms)`);
    return { ...parsed, latency_ms: Date.now() - startMs, _real_gemini: true };
  } catch (err) {
    console.warn(`[GEMINI] ✗ Gemini call failed for ${action}: ${err.message} — falling back to mock`);
    return { ...mockResult(action, applicant), latency_ms: Date.now() - startMs, _fallback: true };
  }
}

/**
 * Check if Gemini is configured and running.
 */
export function getGeminiStatus() {
  return {
    enabled: !!model,
    model: 'gemini-2.5-flash',
    api_key_configured: !!process.env.GEMINI_API_KEY,
  };
}

// ─── Fairness Narrative Generator ───────────────────────────────────────────

/**
 * Generates a human-readable fairness audit narrative.
 * Uses Gemini Flash when GEMINI_API_KEY is configured.
 * Falls back to a deterministic template otherwise.
 *
 * @param {object} report   - The latest fairness report from auditService
 * @param {object} metrics  - Raw metrics from computeAllMetrics
 * @param {object} profile  - Dataset profile from datasetProfiler
 * @returns {Promise<{ narrative: string, generated_at: string, model: string, ai_powered: boolean }>}
 */
export async function generateFairnessNarrative(report, metrics, profile) {
  const generated_at = new Date().toISOString();

  if (!USE_REAL_GEMINI) {
    return {
      narrative: buildDeterministicNarrative(report, metrics, profile),
      generated_at,
      model: 'deterministic-template',
      ai_powered: false,
      note: 'Set GEMINI_API_KEY in .env to enable AI-powered narrative generation.',
    };
  }

  try {
    await initGemini();
    if (!model) throw new Error('Gemini model not initialized');

    const prompt = buildFairnessPrompt(report, metrics, profile);
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    return {
      narrative: text,
      generated_at,
      model: 'gemini-2.5-flash',
      ai_powered: true,
    };
  } catch (err) {
    if (USE_REAL_GEMINI) {
      console.error('[GEMINI] Fairness narrative generation failed:', err.message);
      throw new Error(`Gemini API Error: ${err.message}`);
    }
    console.warn('[GEMINI] Fairness narrative generation failed:', err.message);
    return {
      narrative: buildDeterministicNarrative(report, metrics, profile),
      generated_at,
      model: 'deterministic-template',
      ai_powered: false,
      error: err.message,
    };
  }
}

function buildFairnessPrompt(report, metrics, profile) {
  const violations = report.violations || [];
  const violationSummary = violations.slice(0, 8).map((v) =>
    `- ${v.metric} for group "${v.group}": disparity ${((v.value || 0) * 100).toFixed(1)}% (threshold: ${((v.threshold || 0) * 100).toFixed(1)}%) [${v.severity}]`
  ).join('\n');

  return `You are a senior AI fairness auditor writing a formal executive summary for a fairness audit report.

Dataset: "${profile?.dataset_name || 'Loan Application Dataset'}" — ${profile?.total_rows || 0} records, ${profile?.total_columns || 0} features.
Risk Level: ${report.risk_level?.toUpperCase() || 'UNKNOWN'}
Total Violations: ${report.violation_count || 0}
Analysis Date: ${report.created_at || new Date().toISOString()}

${violations.length > 0 ? `Key Violations Found:\n${violationSummary}` : 'No fairness violations detected above thresholds.'}

Group Distributions:
${JSON.stringify(profile?.group_distributions || {}, null, 2).slice(0, 600)}

Write a professional, plain-English executive summary (3–4 paragraphs) covering:
1. Overall fairness posture and risk assessment
2. The most critical violations and which groups are affected
3. Root-cause hypothesis based on the data profile
4. Recommended remediation actions

Be specific, cite the actual metrics, and do not use markdown headers. Write in present tense. Keep it under 450 words.`;
}

function buildDeterministicNarrative(report, metrics, profile) {
  const risk = report.risk_level || 'unknown';
  const count = report.violation_count || 0;
  const rows = profile?.total_rows || 0;
  const violations = report.violations || [];
  const topViolation = violations[0];

  const riskSentence = {
    low: 'The dataset exhibits low fairness risk. All protected-attribute disparities are within acceptable policy thresholds.',
    medium: `The dataset presents medium fairness risk with ${count} metric violation${count !== 1 ? 's' : ''} requiring review before production deployment.`,
    high: `The dataset presents HIGH fairness risk. ${count} metric violation${count !== 1 ? 's' : ''} were detected, several of which exceed critical thresholds and may indicate systemic bias.`,
    unknown: `Fairness risk assessment is incomplete. ${count} potential violation${count !== 1 ? 's' : ''} were flagged during analysis.`,
  }[risk] || `${count} violation${count !== 1 ? 's' : ''} detected. Risk level: ${risk}.`;

  const violationDetail = topViolation
    ? `The most severe violation is ${topViolation.metric} for the "${topViolation.group}" group, with a measured disparity of ${((topViolation.value || 0) * 100).toFixed(1)}% against a policy threshold of ${((topViolation.threshold || 0) * 100).toFixed(1)}%. `
    : 'No specific group-level violations were identified above the configured thresholds. ';

  const profileDetail = rows > 0
    ? `Analysis was performed on ${rows.toLocaleString()} records across ${profile?.total_columns || 0} features. `
    : '';

  const recommendation = count === 0
    ? 'No remediation is required at this time. Continue monitoring with each new data release.'
    : risk === 'high'
      ? 'Immediate remediation is recommended. Consider re-weighting training samples, applying threshold adjustments for affected groups, and conducting a manual case review via the Review Queue before any production deployment.'
      : 'Moderate remediation is advised. Review flagged violations in the Review Queue and apply targeted threshold adjustments. Re-run analysis after mitigation to confirm improvements.';

  return `${riskSentence}\n\n${profileDetail}${violationDetail}${violations.length > 1 ? `An additional ${violations.length - 1} secondary violation${violations.length > 2 ? 's were' : ' was'} also identified across other protected attributes and metrics. ` : ''}All findings have been logged to the immutable audit trail.\n\n${recommendation}`;
}
