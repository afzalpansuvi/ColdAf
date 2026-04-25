const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Usage-limit middleware factory.
 *
 * Checks whether the requesting organization has exceeded a specific
 * plan limit before allowing the action to proceed.
 *
 * @param {'emails' | 'phone_minutes' | 'users' | 'brands'} resource
 * @returns {Function} Express middleware
 */
function checkUsageLimit(resource) {
  return async (req, res, next) => {
    if (!req.organizationId) {
      // Platform-level users without org context skip limits
      return next();
    }

    try {
      const result = await db.query(
        `SELECT plan, trial_ends_at, is_active,
                max_users, max_brands, max_emails_per_month, max_phone_minutes_per_month,
                emails_sent_this_month, phone_minutes_this_month
         FROM organizations WHERE id = $1`,
        [req.organizationId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Organization not found.',
        });
      }

      const org = result.rows[0];

      // Check if org is active
      if (!org.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Your organization has been suspended. Contact support.',
          code: 'ORG_SUSPENDED',
        });
      }

      // Check if trial has expired
      if (org.plan === 'trial' && org.trial_ends_at && new Date(org.trial_ends_at) < new Date()) {
        return res.status(402).json({
          success: false,
          message: 'Your free trial has expired. Please upgrade to continue.',
          code: 'TRIAL_EXPIRED',
        });
      }

      // Pro plan has unlimited everything
      if (org.plan === 'pro') {
        return next();
      }

      // Check specific resource limits (trial and starter share the same limits)
      switch (resource) {
        case 'emails': {
          if (org.emails_sent_this_month >= org.max_emails_per_month) {
            return res.status(402).json({
              success: false,
              message: `Monthly email limit reached (${org.max_emails_per_month}). Upgrade to Pro for unlimited emails.`,
              code: 'EMAIL_LIMIT_REACHED',
              current: org.emails_sent_this_month,
              limit: org.max_emails_per_month,
            });
          }
          break;
        }

        case 'phone_minutes': {
          if (parseFloat(org.phone_minutes_this_month) >= org.max_phone_minutes_per_month) {
            return res.status(402).json({
              success: false,
              message: `Monthly phone minute limit reached (${org.max_phone_minutes_per_month}). Upgrade to Pro for unlimited calls.`,
              code: 'PHONE_LIMIT_REACHED',
              current: parseFloat(org.phone_minutes_this_month),
              limit: org.max_phone_minutes_per_month,
            });
          }
          break;
        }

        case 'users': {
          const userCount = await db.query(
            `SELECT COUNT(*)::int AS cnt FROM users WHERE organization_id = $1 AND is_active = TRUE`,
            [req.organizationId]
          );
          if (userCount.rows[0].cnt >= org.max_users) {
            return res.status(402).json({
              success: false,
              message: `User limit reached (${org.max_users}). Upgrade to Pro for unlimited users.`,
              code: 'USER_LIMIT_REACHED',
              current: userCount.rows[0].cnt,
              limit: org.max_users,
            });
          }
          break;
        }

        case 'brands': {
          const brandCount = await db.query(
            `SELECT COUNT(*)::int AS cnt FROM brands WHERE organization_id = $1`,
            [req.organizationId]
          );
          if (brandCount.rows[0].cnt >= org.max_brands) {
            return res.status(402).json({
              success: false,
              message: `Brand limit reached (${org.max_brands}). Upgrade to Pro for unlimited brands.`,
              code: 'BRAND_LIMIT_REACHED',
              current: brandCount.rows[0].cnt,
              limit: org.max_brands,
            });
          }
          break;
        }

        default:
          break;
      }

      next();
    } catch (err) {
      logger.error('Usage limit check failed', {
        resource,
        orgId: req.organizationId,
        error: err.message,
      });
      // Fail open — don't block the user if our limit check breaks
      next();
    }
  };
}

module.exports = { checkUsageLimit };
