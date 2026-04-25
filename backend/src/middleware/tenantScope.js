const logger = require('../utils/logger');

/**
 * Tenant-scoping middleware.
 *
 * Reads the organizationId from the authenticated user's JWT and attaches
 * it to `req.organizationId` for use in all downstream queries.
 *
 * Super-admins and the platform owner can optionally scope to a different
 * org via the `X-Org-Id` header (impersonation).
 *
 * Must be placed AFTER the `authenticate` middleware in the chain.
 */
function tenantScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  const role = req.user.role;
  const perms = req.user.permissions || [];

  // Platform owner and super_admin may impersonate via header
  const isPlatformLevel = role === 'platform_owner' || role === 'super_admin';
  const headerOrgId = req.headers['x-org-id'];

  if (isPlatformLevel && headerOrgId) {
    req.organizationId = headerOrgId;
    return next();
  }

  // Platform-level users without an X-Org-Id header: allow through
  // without org scoping (they see cross-org data on platform routes).
  // For org-specific routes they MUST supply the header.
  if (isPlatformLevel && !req.user.organizationId && !headerOrgId) {
    req.organizationId = null;
    return next();
  }

  // Normal org-bound users
  if (!req.user.organizationId) {
    logger.warn('Tenant scope denied — no organization context', {
      userId: req.user.id,
      role,
    });
    return res.status(403).json({
      success: false,
      message: 'No organization context. Access denied.',
    });
  }

  req.organizationId = req.user.organizationId;
  next();
}

/**
 * Stricter variant: requires a non-null organizationId on the request.
 * Use on routes that absolutely need org context (e.g. leads, campaigns).
 */
function requireOrg(req, res, next) {
  if (!req.organizationId) {
    return res.status(400).json({
      success: false,
      message: 'An organization context is required for this endpoint. Provide X-Org-Id header.',
    });
  }
  next();
}

module.exports = { tenantScope, requireOrg };
