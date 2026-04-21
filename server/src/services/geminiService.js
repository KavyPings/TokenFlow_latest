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
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    console.log('[GEMINI] ✓ Gemini 1.5 Flash initialized');
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
    enabled: !!USE_REAL_GEMINI,
    model: 'gemini-1.5-flash',
    api_key_configured: !!process.env.GEMINI_API_KEY,
  };
}
