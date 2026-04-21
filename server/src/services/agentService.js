// ===========================================================
// Agent Service - AI-powered cloud agent actions
// Credentials are always brokered through vault services.
// ===========================================================

import { vaultService } from './vaultService.js';
import { runGeminiStep } from './geminiService.js';
import { readApplicantRecord, writeDecisionRecord } from './gcsService.js';
import { sendDecisionEmail as sendDecisionEmailViaProvider } from './emailService.js';

/**
 * Read an applicant record from cloud storage.
 */
export async function readCloudObject(resource, taskData = {}) {
  const credential = await vaultService.getCredential('gcs-service-account');
  if (!credential.success) throw new Error('Failed to retrieve GCS credential from Token Vault');

  const fallbackApplicant = taskData.applicant || { id: 'APP-001', name: 'Applicant' };
  const applicantId = fallbackApplicant.id || 'APP-001';
  const gcsResult = await readApplicantRecord(applicantId, resource);
  const applicant = gcsResult.data || fallbackApplicant;

  console.log(`[AGENT] Reading applicant record: ${resource}`);

  const aiResult = await runGeminiStep('READ_OBJECT', applicant, {});

  return {
    success: true,
    action: 'READ_OBJECT',
    service: 'gcs',
    resource: gcsResult.objectPath || resource,
    data: {
      bucket: 'loan-applicants',
      object: gcsResult.objectPath || resource,
      size_bytes: JSON.stringify(applicant).length,
      content_type: 'application/json',
      applicant_id: applicant.id,
      applicant_name: applicant.name,
      loan_purpose: applicant.loan_purpose,
      loan_amount: applicant.loan_amount,
      storage_mode: gcsResult.mode,
      ...aiResult,
    },
    credential_source: credential.method,
    message: `Applicant record loaded: ${applicant.name} - ${aiResult.summary || 'Data loaded successfully.'}`,
    gemini_used: aiResult._real_gemini || false,
  };
}

/**
 * Call the credit scoring API via Gemini.
 */
export async function callInternalApi(endpoint, taskData = {}, context = {}) {
  const credential = await vaultService.getCredential('internal-api-key');
  if (!credential.success) throw new Error('Failed to retrieve Internal API credential from Token Vault');

  const applicant = taskData.applicant || { id: 'APP-001', name: 'Applicant' };
  console.log(`[AGENT] Credit scoring via Gemini for ${applicant.name}: ${endpoint}`);

  const aiResult = await runGeminiStep('CALL_INTERNAL_API', applicant, context);

  return {
    success: true,
    action: 'CALL_INTERNAL_API',
    service: 'internal-api',
    endpoint,
    data: {
      status: 200,
      credit_score: aiResult.score,
      risk_tier: aiResult.risk_tier,
      confidence: aiResult.confidence,
      approval_probability: aiResult.approval_probability,
      recommendation: aiResult.recommendation,
      reasoning: aiResult.reasoning,
      fairness_flags: aiResult.protected_attribute_risk || {},
      processing_time_ms: aiResult.latency_ms || 300,
      model: 'gemini-1.5-flash',
      result_id: `score_${Date.now().toString(36)}`,
    },
    credential_source: credential.method,
    message: `Credit score: ${aiResult.score} (${aiResult.risk_tier} risk) - ${aiResult.recommendation}`,
    gemini_used: aiResult._real_gemini || false,
    fairness_flags: aiResult.protected_attribute_risk || {},
  };
}

/**
 * Write final decision record to storage.
 */
export async function writeCloudObject(resource, taskData = {}, context = {}) {
  const credential = await vaultService.getCredential('gcs-service-account');
  if (!credential.success) throw new Error('Failed to retrieve GCS credential from Token Vault');

  const applicant = taskData.applicant || { id: 'APP-001', name: 'Applicant' };
  console.log(`[AGENT] Writing loan decision for ${applicant.name}: ${resource}`);

  const aiResult = await runGeminiStep('WRITE_OBJECT', applicant, context);
  const payload = {
    decision: aiResult.decision,
    amount_approved: aiResult.amount_approved,
    interest_rate: aiResult.interest_rate,
    conditions: aiResult.conditions || [],
    decline_reasons: aiResult.decline_reasons || [],
    decision_letter: aiResult.decision_letter || '',
    decided_at: aiResult.decided_at,
    recommendation: context.creditResult?.recommendation || null,
    score: context.creditResult?.score || null,
  };

  const persisted = await writeDecisionRecord(applicant.id || 'APP-001', resource, payload);

  return {
    success: true,
    action: 'WRITE_OBJECT',
    service: 'gcs',
    resource: persisted.objectPath || resource,
    data: {
      bucket: 'loan-decisions',
      object: persisted.objectPath || resource,
      decision: aiResult.decision,
      amount_approved: aiResult.amount_approved,
      interest_rate: aiResult.interest_rate,
      conditions: aiResult.conditions || [],
      decline_reasons: aiResult.decline_reasons || [],
      decided_at: aiResult.decided_at,
      bytes_written: persisted.bytesWritten,
      version: `v_${Date.now().toString(36)}`,
      storage_mode: persisted.mode,
    },
    credential_source: credential.method,
    message: `Loan decision written: ${String(aiResult.decision || 'processed').toUpperCase()} for ${applicant.name}`,
    gemini_used: aiResult._real_gemini || false,
  };
}

/**
 * Send the final decision email via vault-brokered provider access.
 */
export async function sendDecisionEmail(resource, taskData = {}, context = {}) {
  const applicant = taskData.applicant || { id: 'APP-001', name: 'Applicant', email: 'applicant@example.com' };
  const decision = context.decisionResult || {};
  const aiEmailDraft = await runGeminiStep('SEND_NOTIFICATION', applicant, { decision });

  const sendResult = await sendDecisionEmailViaProvider({
    to: aiEmailDraft.to || applicant.email || 'applicant@example.com',
    subject: aiEmailDraft.subject || `Loan decision for ${applicant.name}`,
    preview: aiEmailDraft.preview || 'Your decision is now available.',
    decision,
    workflowId: taskData.workflowId,
  });

  return {
    success: true,
    action: 'SEND_EMAIL',
    service: 'email',
    resource: resource || 'sendgrid/mail.send',
    data: {
      to: aiEmailDraft.to || applicant.email,
      subject: aiEmailDraft.subject,
      preview: aiEmailDraft.preview,
      provider: sendResult.provider,
      queued: sendResult.queued,
      mode: sendResult.mode,
      message_id: sendResult.messageId,
      estimated_delivery: aiEmailDraft.estimated_delivery,
    },
    credential_source: 'vault_brokered_sendgrid',
    message: `Decision email queued for ${applicant.name}`,
    gemini_used: aiEmailDraft._real_gemini || false,
  };
}

/**
 * UNAUTHORIZED: Agent attempts to read from source control.
 */
export async function readRepo(resource) {
  console.log(`[AGENT] WARNING: attempting unauthorized repo access: ${resource}`);
  return {
    success: false,
    action: 'READ_REPO',
    service: 'source-control',
    resource,
    data: null,
    message: `BLOCKED: Agent attempted unauthorized access to source control "${resource}"`,
  };
}
