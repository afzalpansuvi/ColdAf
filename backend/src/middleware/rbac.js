const logger = require('../utils/logger');

/**
 * Returns middleware that checks whether the authenticated user holds
 * at least one of the required permissions.  The admin wildcard '*'
 * grants access to everything.
 *
 * @param  {...string} permissions - One or more permission strings.
 * @returns {Function} Express middleware.
 */
function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const userPerms = req.user.permissions || [];

    // Admin wildcard grants unrestricted access
    if (userPerms.includes('*')) {
      return next();
    }

    const hasPermission = permissions.some((perm) => userPerms.includes(perm));

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.id,
        required: permissions,
        held: userPerms,
      });
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have the required permissions.',
      });
    }

    next();
  };
}

/**
 * Returns middleware that checks whether the authenticated user's role
 * is one of the allowed roles.
 *
 * @param  {...string} roles - One or more role names.
 * @returns {Function} Express middleware.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Role denied', {
        userId: req.user.id,
        requiredRoles: roles,
        actualRole: req.user.role,
      });
      return res.status(403).json({
        success: false,
        message: 'Forbidden. Your role does not have access to this resource.',
      });
    }

    next();
  };
}

module.exports = { requirePermission, requireRole };
