import { tokenEngine } from '../engine/tokenEngine.js';

export function requireToken(actionType) {
  return (req, res, next) => {
    const tokenId = req.headers['x-capability-token'];

    if (!tokenId) {
      return res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'A valid capability token is required for this action',
        required_action: actionType,
      });
    }

    const token = tokenEngine.getToken(tokenId);

    if (!token) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: `Token ${tokenId} not found`,
      });
    }

    if (token.status !== 'active') {
      return res.status(401).json({
        error: 'TOKEN_NOT_ACTIVE',
        message: `Token ${tokenId} is ${token.status}, not active`,
        status: token.status,
      });
    }

    if (new Date(token.expires_at) < new Date()) {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: `Token ${tokenId} has expired`,
        expired_at: token.expires_at,
      });
    }

    if (actionType && token.action_type !== actionType) {
      return res.status(403).json({
        error: 'WRONG_ACTION_TYPE',
        message: `Token ${tokenId} is for ${token.action_type}, not ${actionType}`,
        expected: actionType,
        actual: token.action_type,
      });
    }

    req.capabilityToken = token;
    next();
  };
}

export function requireTokenById(paramName = 'id') {
  return (req, res, next) => {
    const tokenId = req.headers['x-capability-token'];
    const routeTokenId = req.params[paramName];

    if (!tokenId) {
      return res.status(401).json({
        error: 'MISSING_TOKEN',
        message: 'A valid capability token is required for this action',
      });
    }

    if (tokenId !== routeTokenId) {
      return res.status(401).json({
        error: 'TOKEN_MISMATCH',
        message: 'Capability token header must match the token being consumed',
        header_token: tokenId,
        route_token: routeTokenId,
      });
    }

    return requireToken()(req, res, next);
  };
}
