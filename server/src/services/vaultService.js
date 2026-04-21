// ===========================================================
// Auth0 Token Vault Service
// Manages credential retrieval via Token Vault exchange flow.
// Agent NEVER accesses credentials directly - all through vault proxy.
// ===========================================================

import axios from 'axios';
import { getDb } from '../db/database.js';

class VaultService {
  constructor() {
    this.useAuth0 = process.env.USE_AUTH0 === 'true';
    this.auth0Domain = process.env.AUTH0_DOMAIN;
    this.customApiClientId = process.env.AUTH0_CUSTOM_API_CLIENT_ID;
    this.customApiClientSecret = process.env.AUTH0_CUSTOM_API_CLIENT_SECRET;
  }

  /**
   * Get a credential from Token Vault via RFC 8693 token exchange.
   * In mock mode, returns a simulated credential response.
   *
   * @param {string} serviceName
   * @param {string|null} userAccessToken
   * @param {string|null} connectionName
   */
  async getCredential(serviceName, userAccessToken = null, connectionName = null) {
    this.recordAccess(serviceName);

    if (this.useAuth0 && userAccessToken && connectionName) {
      return this._exchangeViaAuth0(serviceName, userAccessToken, connectionName);
    }

    return this._mockCredential(serviceName);
  }

  /**
   * Perform real Auth0 Token Vault exchange (RFC 8693).
   */
  async _exchangeViaAuth0(serviceName, userAccessToken, connectionName) {
    try {
      const response = await axios.post(`https://${this.auth0Domain}/oauth/token`, {
        client_id: this.customApiClientId,
        client_secret: this.customApiClientSecret,
        subject_token: userAccessToken,
        grant_type: 'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token',
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        requested_token_type: 'http://auth0.com/oauth/token-type/federated-connection-access-token',
        connection: connectionName,
      });

      console.log(`[VAULT] Token exchange successful for ${serviceName}`);
      return {
        success: true,
        service: serviceName,
        method: 'auth0_token_vault',
        access_token: response.data.access_token,
        expires_in: response.data.expires_in,
        token_type: response.data.token_type,
      };
    } catch (error) {
      console.error(`[VAULT] Token exchange failed for ${serviceName}:`, error.response?.data || error.message);
      throw new Error(`Token Vault exchange failed for ${serviceName}: ${error.message}`);
    }
  }

  /**
   * Mock credential retrieval for demo/local development.
   */
  _mockCredential(serviceName) {
    const mockCredentials = {
      'gcs-service-account': {
        success: true,
        service: 'gcs-service-account',
        method: 'token_vault_mock',
        note: 'GCS credential retrieved through vault brokering. Agent never sees the key.',
        retrieved_at: new Date().toISOString(),
      },
      'internal-api-key': {
        success: true,
        service: 'internal-api-key',
        method: 'token_vault_mock',
        note: 'Internal API key retrieved through vault brokering. Agent never sees the key.',
        retrieved_at: new Date().toISOString(),
      },
      'source-control-token': {
        success: true,
        service: 'source-control-token',
        method: 'token_vault_mock',
        note: 'Source control credential is locked in vault and should never be used by agents.',
        retrieved_at: new Date().toISOString(),
      },
      'sendgrid-api-key': {
        success: true,
        service: 'sendgrid-api-key',
        method: 'token_vault_mock',
        note: 'SendGrid key retrieved through vault brokering. Agent never receives the raw key.',
        retrieved_at: new Date().toISOString(),
      },
    };

    console.log(`[VAULT] Mock credential retrieved for ${serviceName}`);
    return mockCredentials[serviceName] || { success: false, error: `Unknown service: ${serviceName}` };
  }

  /**
   * List all stored credentials (names only, never values).
   */
  listCredentials() {
    const db = getDb();
    return db.prepare('SELECT id, service_name, display_name, connection_type, status, last_accessed FROM vault_credentials').all();
  }

  /**
   * Record that a credential was accessed.
   */
  recordAccess(serviceName) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE vault_credentials SET last_accessed = ? WHERE service_name = ?').run(now, serviceName);
  }

  /**
   * Get vault connection status.
   */
  getStatus() {
    return {
      connected: true,
      mode: this.useAuth0 ? 'auth0_token_vault' : 'mock',
      domain: this.useAuth0 ? this.auth0Domain : 'mock.auth0.com',
      credentials_count: this.listCredentials().length,
      message: this.useAuth0
        ? 'Connected to Auth0 Token Vault'
        : 'Running in mock mode - configure AUTH0 env vars for production',
    };
  }
}

export const vaultService = new VaultService();
