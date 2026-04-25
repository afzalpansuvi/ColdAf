const logger = require('../utils/logger');

/**
 * Platform Owner middleware.
 *
 * Restricts access to the single platform owner account (apansuvi1@gmail.com).
 * Checks both the role AND the hardcoded email — even if someone manually
 * assigns the platform_owner role to another user, they still won't pass.
 *
 * Must be placed AFTER the `authenticate` middleware in the chain.
 */
const PLATFORM_OWNER_EMAIL = 'apansuvi1@gmail.com';

function requirePlatformOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  const isOwner =
    req.user.role === 'platform_owner' &&
    req.user.email === PLATFORM_OWNER_EMAIL;

  if (!isOwner) {
    logger.warn('Platform owner access denied', {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
    });
    return res.status(403).json({
      success: false,
      message: 'Access restricted to the platform owner.',
    });
  }

  next();
}

module.exports = { requirePlatformOwner, PLATFORM_OWNER_EMAIL };
