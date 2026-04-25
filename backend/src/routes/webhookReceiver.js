const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { isValidEmail } = require('../utils/validators');
const { verifyWebhookSignature } = require('../utils/validators');
const { processDiscordLeads } = require('../services/vapiCallAgent');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /leads/:endpointPath - Public webhook receiver (no auth)
//
// Receives lead data from external forms, validates the HMAC signature,
// maps fields according to the webhook source's configuration, and inserts
// the lead into the database.
// ---------------------------------------------------------------------------
router.post('/leads/:endpointPath', express.json({ limit: '1mb' }), async (req, res) => {
  const { endpointPath } = req.params;
  let webhookSource = null;

  try {
    // Look up the webhook source by endpoint_path
    const sourceResult = await db.query(
      `SELECT id, name, secret_token, field_mapping, brand_id, is_active
       FROM webhook_sources
       WHERE endpoint_path = $1`,
      [endpointPath]
    );

    if (sourceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webhook endpoint not found.',
      });
    }

    webhookSource = sourceResult.rows[0];

    // Check if the webhook source is active
    if (!webhookSource.is_active) {
      await logWebhookEvent(webhookSource.id, req.body, 'failed', 'Webhook source is inactive.');
      return res.status(410).json({
        success: false,
        message: 'This webhook endpoint is no longer active.',
      });
    }

    // Verify HMAC signature
    const signature = req.headers['x-webhook-signature'];
    if (!signature) {
      await logWebhookEvent(webhookSource.id, req.body, 'failed', 'Missing X-Webhook-Signature header.');
      return res.status(401).json({
        success: false,
        message: 'Missing webhook signature.',
      });
    }

    // We need the raw body for signature verification.
    // Express.json() parses the body, so we reconstruct the string.
    const rawBody = JSON.stringify(req.body);
    const isValidSignature = verifyWebhookSignature(rawBody, signature, webhookSource.secret_token);

    if (!isValidSignature) {
      await logWebhookEvent(webhookSource.id, req.body, 'failed', 'Invalid webhook signature.');
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature.',
      });
    }

    // Map incoming fields using the source's field_mapping
    const payload = req.body;
    const fieldMapping = webhookSource.field_mapping || {};

    // field_mapping maps our internal field names to the incoming payload keys.
    // Example: { "full_name": "name", "email": "contact_email", "phone": "phone_number" }
    const mappedLead = {};

    const internalFields = ['full_name', 'email', 'phone', 'lead_type', 'industry', 'project_details'];

    for (const field of internalFields) {
      const sourceField = fieldMapping[field];
      if (sourceField && payload[sourceField] !== undefined && payload[sourceField] !== null) {
        mappedLead[field] = String(payload[sourceField]).trim();
      } else if (payload[field] !== undefined && payload[field] !== null) {
        // Fall back to direct field name match
        mappedLead[field] = String(payload[field]).trim();
      }
    }

    // Validate required fields
    if (!mappedLead.email) {
      await logWebhookEvent(webhookSource.id, payload, 'failed', 'Missing required field: email.');
      return res.status(400).json({
        success: false,
        message: 'email is required.',
      });
    }

    mappedLead.email = mappedLead.email.toLowerCase();

    if (!isValidEmail(mappedLead.email)) {
      await logWebhookEvent(webhookSource.id, payload, 'failed', `Invalid email format: ${mappedLead.email}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid email format.',
      });
    }

    if (!mappedLead.full_name) {
      // Try common fallback field names from the raw payload
      const nameValue = payload.name || payload.full_name || payload.fullName
        || payload.first_name || payload.firstName;
      if (nameValue) {
        mappedLead.full_name = String(nameValue).trim();
      }
    }

    if (!mappedLead.full_name) {
      await logWebhookEvent(webhookSource.id, payload, 'failed', 'Missing required field: full_name.');
      return res.status(400).json({
        success: false,
        message: 'full_name (or name) is required.',
      });
    }

    // Check for duplicate (email + brand_id)
    const dupCheck = await db.query(
      `SELECT id FROM leads WHERE email = $1 AND brand_id = $2`,
      [mappedLead.email, webhookSource.brand_id]
    );

    if (dupCheck.rows.length > 0) {
      await logWebhookEvent(
        webhookSource.id,
        payload,
        'duplicate',
        `Lead with email ${mappedLead.email} already exists for this brand.`
      );
      return res.status(409).json({
        success: false,
        message: 'A lead with this email already exists for this brand.',
        existingLeadId: dupCheck.rows[0].id,
      });
    }

    // Insert the lead
    const insertResult = await db.query(
      `INSERT INTO leads
        (full_name, email, phone, lead_type, industry, project_details,
         source_type, source_detail, status, unsubscribed, brand_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'webhook', $7, 'new', false, $8)
       RETURNING id`,
      [
        mappedLead.full_name,
        mappedLead.email,
        mappedLead.phone || null,
        mappedLead.lead_type || null,
        mappedLead.industry || null,
        mappedLead.project_details || null,
        webhookSource.name,
        webhookSource.brand_id,
      ]
    );

    const leadId = insertResult.rows[0].id;

    // Log successful webhook event
    await logWebhookEvent(webhookSource.id, payload, 'success', null);

    logger.info('Lead created via webhook', {
      leadId,
      email: mappedLead.email,
      webhookSource: webhookSource.name,
      brandId: webhookSource.brand_id,
    });

    // If the webhook source name matches the Discord source filter, immediately
    // trigger the Vapi call agent so the lead gets called without waiting for
    // the next scheduled scan. This runs asynchronously — we don't await it.
    setImmediate(async () => {
      try {
        const sourceNameLower = (webhookSource.name || '').toLowerCase();
        if (sourceNameLower.includes('discord')) {
          await processDiscordLeads();
        }
      } catch (vapiTriggerErr) {
        logger.error('Vapi immediate trigger after webhook lead failed', {
          error: vapiTriggerErr.message,
          leadId,
        });
      }
    });

    return res.status(200).json({
      success: true,
      leadId,
    });
  } catch (err) {
    logger.error('Webhook receiver error', {
      error: err.message,
      stack: err.stack,
      endpointPath,
    });

    // Attempt to log the failed event
    if (webhookSource) {
      try {
        await logWebhookEvent(
          webhookSource.id,
          req.body,
          'failed',
          `Internal error: ${err.message}`
        );
      } catch (logErr) {
        logger.error('Failed to log webhook event after error', { error: logErr.message });
      }
    }

    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while processing the webhook.',
    });
  }
});

// ---------------------------------------------------------------------------
// Helper: log a webhook event
// ---------------------------------------------------------------------------
async function logWebhookEvent(webhookSourceId, payload, status, errorMessage) {
  try {
    await db.query(
      `INSERT INTO webhook_events (webhook_source_id, payload, status, error_message)
       VALUES ($1, $2, $3, $4)`,
      [
        webhookSourceId,
        JSON.stringify(payload || {}),
        status,
        errorMessage || null,
      ]
    );
  } catch (err) {
    // Logging should never crash the main handler
    logger.error('Failed to log webhook event', {
      error: err.message,
      webhookSourceId,
      status,
    });
  }
}

module.exports = router;
