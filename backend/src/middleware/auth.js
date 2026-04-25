const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * JWT authentication middleware.
 * Reads the access token from the HTTP-only cookie named 'access_token',
 * verifies it, and attaches the decoded payload to req.user.
 */
function authenticate(req, res, next) {
  try {
    const token = req.cookies && req.cookies.access_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No access token provided.',
      });
    }

    const decoded = jwt.verify(token, env.jwt.secret);

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions || [],
      organizationId: decoded.organizationId || null,
      organizationSlug: decoded.organizationSlug || null,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logger.debug('Access token expired', { error: err.message });
      return res.status(401).json({
        success: false,
        message: 'Access token has expired. Please refresh your session.',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (err.name === 'JsonWebTokenError') {
      logger.warn('Invalid JWT presented', { error: err.message });
      return res.status(401).json({
        success: false,
        message: 'Invalid access token.',
      });
    }

    logger.error('Unexpected error during authentication', { error: err.message });
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.',
    });
  }
}

module.exports = { authenticate };
