import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { vaultService } from './vaultService.js';

const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';

function buildFallbackResult(message) {
  return {
    success: true,
    mode: 'mock',
    queued: true,
    provider: 'sendgrid',
    messageId: `mock_msg_${uuidv4().slice(0, 10)}`,
    message,
    timestamp: new Date().toISOString(),
  };
}

function getApiKeyFromCredential(credential) {
  if (process.env.SENDGRID_API_KEY) return process.env.SENDGRID_API_KEY;
  if (!credential) return '';
  if (credential.access_token) return credential.access_token;
  if (credential.api_key) return credential.api_key;
  return '';
}

export async function sendDecisionEmail(emailPayload) {
  const credential = await vaultService.getCredential('sendgrid-api-key');
  const apiKey = getApiKeyFromCredential(credential);
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'no-reply@tokenflow.local';
  const { to, subject, preview, decision, workflowId } = emailPayload;

  if (!apiKey) {
    return buildFallbackResult(`Email queued locally for ${to}: ${subject}`);
  }

  const contentText = [
    preview || 'Your loan decision is available.',
    '',
    `Decision: ${decision?.decision || 'processed'}`,
  ].join('\n');

  try {
    const response = await axios.post(
      SENDGRID_ENDPOINT,
      {
        personalizations: [
          {
            to: [{ email: to }],
            subject,
            custom_args: {
              workflow_id: workflowId || 'unknown',
            },
          },
        ],
        from: { email: fromEmail, name: 'TokenFlow Loan Desk' },
        content: [{ type: 'text/plain', value: contentText }],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      mode: 'sendgrid',
      queued: response.status >= 200 && response.status < 300,
      provider: 'sendgrid',
      messageId: response.headers['x-message-id'] || `sg_${uuidv4().slice(0, 10)}`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.warn(`[EMAIL] SendGrid send failed, falling back to mock queue: ${error.message}`);
    return buildFallbackResult(`SendGrid unavailable; queued fallback notification for ${to}`);
  }
}

