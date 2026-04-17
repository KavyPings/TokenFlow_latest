// ═══════════════════════════════════════════════════════════
// Vault Routes — Credential vault status
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import { vaultService } from '../services/vaultService.js';

const router = Router();

// ─── GET /api/vault/credentials ─────────────────────────────
// List stored credentials (names only, never values)
router.get('/credentials', (req, res) => {
  const credentials = vaultService.listCredentials();
  res.json({
    success: true,
    credentials,
    count: credentials.length,
    note: 'Only credential names are shown. Actual secrets are stored in Auth0 Token Vault and never exposed.',
  });
});

// ─── GET /api/vault/status ──────────────────────────────────
// Vault connection status
router.get('/status', (req, res) => {
  const status = vaultService.getStatus();
  res.json({ success: true, ...status });
});

export default router;
