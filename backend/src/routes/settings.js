const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireRole, requirePermission } = require('../middleware/rbac');
const audit = require('../services/audit');

const router = express.Router();

// All settings routes require authentication + org scope + admin
router.use(authenticate);
router.use(tenantScope);
router.use(requireOrg);
router.use(requirePermission('*'));

// ---------------------------------------------------------------------------
// Known setting keys for validation
// ---------------------------------------------------------------------------
const KNOWN_SETTINGS = [
  // API keys (managed via integrations route, but recognized here)
  'anthropic_api_key',
  'sendgrid_api_key',
  'mailgun_api_key',

  // General application settings
  'app_name',
  'app_url',
  'default_from_name',
  'default_from_email',
  'default_reply_to',

  // Email sending defaults
  'default_daily_send_limit',
  'default_send_window_start',
  'default_send_window_end',
  'default_send_days',
  'default_min_delay_minutes',
  'default_max_delay_minutes',

  // AI settings
  'default_ai_model',
  'ai_temperature',
  'ai_max_tokens',

  // Notification settings
  'notifications_enabled',
  'notify_on_reply',
  'notify_on_bounce',
  'notify_on_unsubscribe',
  'notify_on_campaign_complete',
  'notify_on_error',
  'notification_email',
  'notification_discord_webhook',

  // System settings
  'maintenance_mode',
  'data_retention_days',
  'max_csv_import_rows',
  'webhook_timeout_seconds',
];

const NOTIFICATION_SETTINGS = [
  'notifications_enabled',
  'notify_on_reply',
  'notify_on_bounce',
  'notify_on_unsubscribe',
  'notify_on_campaign_complete',
  'notify_on_error',
  'notification_email',
  'notification_discord_webhook',
];

// ---------------------------------------------------------------------------
// GET / - Return all system settings as key-value object
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT key, value, updated_at FROM system_settings ORDER BY key ASC`
    );

    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    return res.json({
      success: true,
      data: settings,
    });
  } catch (err) {
    logger.error('Get settings error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching settings.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT / - Update multiple settings at once
// ---------------------------------------------------------------------------
router.put('/', async (req, res) => {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be an object with key-value pairs.',
      });
    }

    // Validate all keys are known
    const unknownKeys = Object.keys(updates).filter((key) => !KNOWN_SETTINGS.includes(key));
    if (unknownKeys.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Unknown setting keys: ${unknownKeys.join(', ')}`,
      });
    }

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Fetch current values for audit logging
      const keysToUpdate = Object.keys(updates);
      const currentResult = await client.query(
        `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
        [keysToUpdate]
      );

      const currentValues = {};
      for (const row of currentResult.rows) {
        currentValues[row.key] = row.value;
      }

      // Upsert each setting
      for (const [key, value] of Object.entries(updates)) {
        const stringValue = value === null ? null : String(value);

        await client.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE
           SET value = $2, updated_at = NOW()`,
          [key, stringValue]
        );
      }

      await client.query('COMMIT');

      // Build audit metadata with old and new values
      const changes = {};
      for (const key of keysToUpdate) {
        changes[key] = {
          old: currentValues[key] || null,
          new: updates[key],
        };
      }

      await audit.logAction({
        actorId: req.user.id,
        actorName: req.user.email,
        actionType: 'settings.update',
        targetType: 'system_settings',
        targetId: null,
        description: `Admin updated settings: ${keysToUpdate.join(', ')}`,
        metadata: { changes },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      logger.info('Settings updated', { keys: keysToUpdate, updatedBy: req.user.id });

      return res.json({
        success: true,
        message: `Settings updated: ${keysToUpdate.join(', ')}`,
        data: { updatedKeys: keysToUpdate },
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Update settings error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating settings.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /notifications - Return notification preference settings
// ---------------------------------------------------------------------------
router.get('/notifications', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
      [NOTIFICATION_SETTINGS]
    );

    const settings = {};
    // Initialize all notification settings with defaults
    for (const key of NOTIFICATION_SETTINGS) {
      settings[key] = null;
    }

    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    return res.json({
      success: true,
      data: settings,
    });
  } catch (err) {
    logger.error('Get notification settings error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching notification settings.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /notifications - Update notification preferences
// ---------------------------------------------------------------------------
router.put('/notifications', async (req, res) => {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be an object with notification settings.',
      });
    }

    // Only allow notification-related settings
    const invalidKeys = Object.keys(updates).filter((key) => !NOTIFICATION_SETTINGS.includes(key));
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid notification setting keys: ${invalidKeys.join(', ')}. Allowed: ${NOTIFICATION_SETTINGS.join(', ')}`,
      });
    }

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Fetch current values for audit logging
      const keysToUpdate = Object.keys(updates);
      const currentResult = await client.query(
        `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
        [keysToUpdate]
      );

      const currentValues = {};
      for (const row of currentResult.rows) {
        currentValues[row.key] = row.value;
      }

      // Upsert each notification setting
      for (const [key, value] of Object.entries(updates)) {
        const stringValue = value === null ? null : String(value);

        await client.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE
           SET value = $2, updated_at = NOW()`,
          [key, stringValue]
        );
      }

      await client.query('COMMIT');

      const changes = {};
      for (const key of keysToUpdate) {
        changes[key] = {
          old: currentValues[key] || null,
          new: updates[key],
        };
      }

      await audit.logAction({
        actorId: req.user.id,
        actorName: req.user.email,
        actionType: 'settings.notifications_update',
        targetType: 'system_settings',
        targetId: null,
        description: `Admin updated notification settings: ${keysToUpdate.join(', ')}`,
        metadata: { changes },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      logger.info('Notification settings updated', { keys: keysToUpdate, updatedBy: req.user.id });

      return res.json({
        success: true,
        message: `Notification settings updated: ${keysToUpdate.join(', ')}`,
        data: { updatedKeys: keysToUpdate },
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Update notification settings error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating notification settings.',
    });
  }
});

module.exports = router;
