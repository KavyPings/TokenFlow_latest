// ═══════════════════════════════════════════════════════════
// Auth0 JWT Middleware — Validates Auth0 access tokens
// ═══════════════════════════════════════════════════════════

import { auth } from 'express-oauth2-jwt-bearer';

/**
 * Auth0 JWT validation middleware
 * In dev mode (USE_AUTH0=false), allows all requests through
 * In production, validates JWTs using express-oauth2-jwt-bearer
 */
export function createAuth0Middleware() {
  const useAuth0 = process.env.USE_AUTH0 === 'true';

  if (!useAuth0) {
    // Permissive mode for local dev
    return (req, res, next) => {
      req.auth = {
        sub: 'dev-user',
        permissions: ['admin'],
      };
      next();
    };
  }

  // Production mode: real Auth0 JWT validation
  return auth({
    audience: process.env.AUTH0_AUDIENCE,
    issuerBaseURL: (process.env.AUTH0_ISSUER || `https://${process.env.AUTH0_DOMAIN}/`).replace(/\/$/, ''),
    tokenSigningAlg: 'RS256',
  });
}

/**
 * Optional: middleware that requires specific permissions
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    const permissions = req.auth?.permissions || [];
    if (permissions.includes(permission) || permissions.includes('admin')) {
      return next();
    }
    return res.status(403).json({
      error: 'INSUFFICIENT_PERMISSIONS',
      message: `Required permission: ${permission}`,
    });
  };
}
