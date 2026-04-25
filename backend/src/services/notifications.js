const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Creates a notification record in the notifications table.
 * If userId is null, creates a notification for every admin user.
 *
 * @param {Object} params
 * @param {string|null} params.userId   - Target user UUID, or null for all admins
 * @param {string}      params.type     - Notification type (e.g. 'reply_received', 'campaign_paused')
 * @param {string}      params.title    - Short notification title
 * @param {string}      params.message  - Full notification message
 * @param {Object}      [params.metadata] - Additional JSON data
 * @returns {Promise<string[]>} Array of created notification IDs
 */
async function createNotification({ userId = null, type, title, message, metadata = {} }) {
  if (!type || !title || !message) {
    logger.warn('createNotification called with missing required fields', { type, title });
    return [];
  }

  try {
    const createdIds = [];

    if (userId) {
      // Create notification for a specific user
      const result = await db.query(
        `INSERT INTO notifications (user_id, type, title, message, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, type, title, message, JSON.stringify(metadata)]
      );
      createdIds.push(result.rows[0].id);
    } else {
      // Create notification for all admin users
      const adminResult = await db.query(
        `SELECT u.id
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE r.name = 'admin' AND u.is_active = TRUE`
      );

      if (adminResult.rows.length === 0) {
        logger.warn('No active admin users found for broadcast notification');
        return [];
      }

      for (const admin of adminResult.rows) {
        const result = await db.query(
          `INSERT INTO notifications (user_id, type, title, message, metadata)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [admin.id, type, title, message, JSON.stringify(metadata)]
        );
        createdIds.push(result.rows[0].id);
      }
    }

    logger.debug('Notifications created', {
      count: createdIds.length,
      type,
      userId: userId || 'all_admins',
    });

    return createdIds;
  } catch (err) {
    logger.error('Failed to create notification', {
      error: err.message,
      type,
      title,
      userId,
    });
    return [];
  }
}

/**
 * Sends a notification to a Discord webhook as an embed.
 *
 * @param {string} webhookUrl - Full Discord webhook URL
 * @param {Object} params
 * @param {string} params.title   - Embed title
 * @param {string} params.message - Embed description text
 * @param {number} [params.color] - Embed sidebar color as decimal integer (default: 0x5865F2 / Discord blurple)
 */
async function sendDiscordNotification(webhookUrl, { title, message, color = 0x5865F2 }) {
  if (!webhookUrl) {
    logger.warn('sendDiscordNotification called without webhookUrl');
    return;
  }

  const payload = JSON.stringify({
    embeds: [
      {
        title: title || 'ColdAF Notification',
        description: message || '',
        color,
        timestamp: new Date().toISOString(),
        footer: {
          text: 'ColdAF Email Tool',
        },
      },
    ],
  });

  try {
    await sendHttpPost(webhookUrl, payload, {
      'Content-Type': 'application/json',
    });

    logger.debug('Discord notification sent', { title });
  } catch (err) {
    logger.error('Failed to send Discord notification', {
      error: err.message,
      webhookUrl: webhookUrl.substring(0, 60) + '...',
      title,
    });
  }
}

/**
 * Sends an outbound webhook POST with an HMAC-SHA256 signature.
 * The signature is placed in the X-Webhook-Signature header as a hex digest.
 *
 * @param {string} url     - Destination URL
 * @param {Object} payload - JSON-serializable payload
 * @param {string} secret  - Shared secret for HMAC signing
 */
async function sendOutboundWebhook(url, payload, secret) {
  if (!url) {
    logger.warn('sendOutboundWebhook called without url');
    return;
  }

  const body = JSON.stringify(payload);

  const headers = {
    'Content-Type': 'application/json',
  };

  if (secret) {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${signature}`;
  }

  try {
    await sendHttpPost(url, body, headers);

    logger.debug('Outbound webhook sent', { url: url.substring(0, 80) });
  } catch (err) {
    logger.error('Failed to send outbound webhook', {
      error: err.message,
      url: url.substring(0, 80),
    });
    throw err;
  }
}

/**
 * Checks the outbound_integrations table for active integrations that match
 * the given event type, then fires Discord notifications or custom webhooks
 * as appropriate.
 *
 * @param {string} eventType - Event name (e.g. 'reply_received', 'campaign_paused')
 * @param {Object} data      - Event data to include in the notification/payload
 */
async function triggerEventNotifications(eventType, data = {}) {
  if (!eventType) {
    logger.warn('triggerEventNotifications called without eventType');
    return;
  }

  try {
    // Find all active integrations whose event_triggers array contains this event type
    const result = await db.query(
      `SELECT id, name, type, config, event_triggers
       FROM outbound_integrations
       WHERE is_active = TRUE
         AND event_triggers @> $1::jsonb`,
      [JSON.stringify([eventType])]
    );

    if (result.rows.length === 0) {
      logger.debug('No integrations matched event', { eventType });
      return;
    }

    const promises = result.rows.map(async (integration) => {
      try {
        const config = integration.config || {};

        if (integration.type === 'discord') {
          const webhookUrl = config.webhook_url;
          if (!webhookUrl) {
            logger.warn('Discord integration missing webhook_url', {
              integrationId: integration.id,
            });
            return;
          }

          await sendDiscordNotification(webhookUrl, {
            title: `${eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
            message: formatEventMessage(eventType, data),
            color: getEventColor(eventType),
          });
        } else if (integration.type === 'custom_webhook') {
          const url = config.url;
          const secret = config.secret || '';
          if (!url) {
            logger.warn('Custom webhook integration missing url', {
              integrationId: integration.id,
            });
            return;
          }

          await sendOutboundWebhook(
            url,
            {
              event: eventType,
              timestamp: new Date().toISOString(),
              data,
            },
            secret
          );
        }

        logger.debug('Event notification sent for integration', {
          integrationId: integration.id,
          integrationName: integration.name,
          type: integration.type,
          eventType,
        });
      } catch (err) {
        logger.error('Failed to send event notification for integration', {
          error: err.message,
          integrationId: integration.id,
          integrationName: integration.name,
          eventType,
        });
      }
    });

    await Promise.allSettled(promises);
  } catch (err) {
    logger.error('Failed to trigger event notifications', {
      error: err.message,
      eventType,
    });
  }
}

// ─── Internal Helpers ────────────────────────────────────────────────

/**
 * Formats event data into a human-readable message string for Discord embeds.
 */
function formatEventMessage(eventType, data) {
  const parts = [];

  switch (eventType) {
    case 'reply_received':
      if (data.leadEmail) parts.push(`From: ${data.leadEmail}`);
      if (data.leadName) parts.push(`Lead: ${data.leadName}`);
      if (data.campaignName) parts.push(`Campaign: ${data.campaignName}`);
      if (data.brandName) parts.push(`Brand: ${data.brandName}`);
      break;

    case 'campaign_paused':
      if (data.campaignName) parts.push(`Campaign: ${data.campaignName}`);
      if (data.reason) parts.push(`Reason: ${data.reason}`);
      break;

    case 'smtp_degraded':
    case 'smtp_failed':
      if (data.accountEmail) parts.push(`Account: ${data.accountEmail}`);
      if (data.error) parts.push(`Error: ${data.error}`);
      break;

    case 'bounce_threshold':
    case 'spam_threshold':
      if (data.campaignName) parts.push(`Campaign: ${data.campaignName}`);
      if (data.rate !== undefined) parts.push(`Rate: ${data.rate}%`);
      if (data.threshold !== undefined) parts.push(`Threshold: ${data.threshold}%`);
      break;

    default:
      if (data.message) parts.push(data.message);
      break;
  }

  return parts.length > 0
    ? parts.join('\n')
    : `Event triggered: ${eventType}`;
}

/**
 * Returns a Discord embed color based on event severity.
 */
function getEventColor(eventType) {
  const colors = {
    reply_received: 0x57f287,    // Green
    campaign_paused: 0xfee75c,   // Yellow
    smtp_degraded: 0xed4245,     // Red
    smtp_failed: 0xed4245,       // Red
    bounce_threshold: 0xe67e22,  // Orange
    spam_threshold: 0xe67e22,    // Orange
  };
  return colors[eventType] || 0x5865f2; // Default: blurple
}

/**
 * Low-level HTTP/HTTPS POST helper.
 * Returns a promise that resolves with the response body or rejects on error.
 */
function sendHttpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      return reject(new Error(`Invalid URL: ${url}`));
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    };

    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseBody);
        } else {
          reject(
            new Error(
              `HTTP ${res.statusCode} from ${parsedUrl.hostname}: ${responseBody.substring(0, 200)}`
            )
          );
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request to ${parsedUrl.hostname} timed out after 15s`));
    });

    req.on('error', (err) => {
      reject(new Error(`Request to ${parsedUrl.hostname} failed: ${err.message}`));
    });

    req.write(body);
    req.end();
  });
}

module.exports = {
  createNotification,
  sendDiscordNotification,
  sendOutboundWebhook,
  triggerEventNotifications,
};
