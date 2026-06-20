const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireAdmin } = require('../middleware/rbac');
const { sanitizeBody } = require('../middleware/validation');
const audit = require('../services/audit');

// ═══════════════════════════════════════════════════════════════
//  HubSpot CRM Integration Routes
// ═══════════════════════════════════════════════════════════════

// GET /api/integrations/hubspot/status — Check connection status
router.get('/status', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, hubspot_portal_id, hubspot_domain, sync_enabled,
              sync_contacts, sync_activities, sync_deals, sync_companies,
              last_sync_at, last_sync_status, records_synced_total,
              connected_at, is_active
       FROM hubspot_connections
       WHERE organization_id = $1
       LIMIT 1`,
      [req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, data: { connected: false } });
    }

    const connection = result.rows[0];
    connection.connected = true;

    // Check if token is expired
    const isExpired = connection.token_expires_at && new Date(connection.token_expires_at) < new Date();
    connection.token_expired = isExpired || false;

    return res.json({ success: true, data: connection });
  } catch (err) {
    logger.error('HubSpot status check failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/integrations/hubspot/auth-url — Get OAuth authorization URL
router.get('/auth-url', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `${process.env.BACKEND_URL}/api/integrations/hubspot/callback`;

    if (!clientId) {
      return res.status(500).json({
        success: false,
        message: 'HubSpot integration not configured. Set HUBSPOT_CLIENT_ID.',
      });
    }

    // Generate state for CSRF protection
    const crypto = require('crypto');
    const state = crypto.randomBytes(32).toString('hex');

    // Store state in session/cache (simplified: store in DB)
    await db.query(
      `INSERT INTO system_settings (key, value, category)
       VALUES ($1, $2, 'hubspot_oauth')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [`hubspot_oauth_state_${req.user.id}`, JSON.stringify({ state, orgId: req.organizationId, userId: req.user.id })]
    );

    const scopes = [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.schemas.contacts.read',
      'crm.objects.activities.read',
      'crm.objects.activities.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.objects.companies.read',
      'crm.objects.companies.write',
    ].join(' ');

    const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`;

    return res.json({ success: true, data: { authUrl } });
  } catch (err) {
    logger.error('HubSpot auth URL failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/integrations/hubspot/callback — OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({ success: false, message: 'Missing code or state.' });
    }

    // Verify state
    const stateResult = await db.query(
      `SELECT value FROM system_settings WHERE key = $1 AND category = 'hubspot_oauth'`,
      [`hubspot_oauth_state_${state}`]
    );

    if (stateResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired state.' });
    }

    const stateData = JSON.parse(stateResult.rows[0].value);

    // Exchange code for tokens
    const axios = require('axios');
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `${process.env.BACKEND_URL}/api/integrations/hubspot/callback`;

    const tokenResponse = await axios.post('https://api.hubapi.com/oauth/v1/token', null, {
      params: {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Get portal info
    const portalResponse = await axios.get('https://api.hubapi.com/integrations/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const portalId = portalResponse.data.portalId;
    const hubspotDomain = portalResponse.data.hub_domain || `app.hubspot.com`;

    // Save connection
    await db.query(
      `INSERT INTO hubspot_connections (
         organization_id, access_token, refresh_token, token_expires_at,
         hubspot_portal_id, hubspot_domain, sync_enabled, connected_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
       ON CONFLICT (organization_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         hubspot_portal_id = EXCLUDED.hubspot_portal_id,
         hubspot_domain = EXCLUDED.hubspot_domain,
         sync_enabled = TRUE,
         updated_at = NOW()`,
      [stateData.orgId, access_token, refresh_token, expiresAt, portalId, hubspotDomain, stateData.userId]
    );

    // Clean up state
    await db.query(
      `DELETE FROM system_settings WHERE key = $1`,
      [`hubspot_oauth_state_${state}`]
    );

    logger.info('HubSpot connected', { orgId: stateData.orgId, portalId });

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
    res.redirect(`${frontendUrl}/settings/integrations?hubspot=connected`);
  } catch (err) {
    logger.error('HubSpot OAuth callback failed', { error: err.message });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
    res.redirect(`${frontendUrl}/settings/integrations?hubspot=error&message=${encodeURIComponent(err.message)}`);
  }
});

// POST /api/integrations/hubspot/sync — Trigger manual sync
router.post('/sync', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const { syncType = 'contacts' } = req.body;

    const connection = await db.query(
      `SELECT * FROM hubspot_connections WHERE organization_id = $1 AND is_active = TRUE`,
      [req.organizationId]
    );

    if (connection.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'HubSpot not connected.' });
    }

    const conn = connection.rows[0];

    // Check token expiry
    if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'HubSpot token expired. Reconnect the integration.',
      });
    }

    // Log sync start
    const logResult = await db.query(
      `INSERT INTO hubspot_sync_logs (
         organization_id, hubspot_connection_id, sync_type, direction, status
       )
       VALUES ($1, $2, $3, 'bidirectional', 'running')
       RETURNING id`,
      [req.organizationId, conn.id, syncType]
    );
    const logId = logResult.rows[0].id;

    // Start sync (async - don't wait for completion in HTTP response)
    const hubspotSync = require('../services/hubspotSync');
    hubspotSync.runSync(conn, syncType, logId).catch(err => {
      logger.error('HubSpot sync failed', { error: err.message, logId });
    });

    return res.json({
      success: true,
      message: 'Sync started. Check sync logs for progress.',
      data: { syncLogId: logId },
    });
  } catch (err) {
    logger.error('HubSpot sync trigger failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/integrations/hubspot/sync-logs — Get sync history
router.get('/sync-logs', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;

    const result = await db.query(
      `SELECT id, sync_type, direction, status, records_processed, records_created,
              records_updated, records_failed, error_message, started_at, completed_at
       FROM hubspot_sync_logs
       WHERE organization_id = $1
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [req.organizationId, limit, offset]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('HubSpot sync logs failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/integrations/hubspot/config — Update sync config
router.put('/config', authenticate, tenantScope, requireOrg, requireAdmin, sanitizeBody, async (req, res) => {
  try {
    const { syncContacts, syncActivities, syncDeals, syncCompanies, fieldMapping } = req.body;

    const result = await db.query(
      `UPDATE hubspot_connections
       SET sync_contacts = COALESCE($1, sync_contacts),
           sync_activities = COALESCE($2, sync_activities),
           sync_deals = COALESCE($3, sync_deals),
           sync_companies = COALESCE($4, sync_companies),
           field_mapping = COALESCE($5, field_mapping),
           updated_at = NOW()
       WHERE organization_id = $6
       RETURNING *`,
      [syncContacts, syncActivities, syncDeals, syncCompanies, fieldMapping, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'HubSpot not connected.' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('HubSpot config update failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/integrations/hubspot/disconnect — Disconnect HubSpot
router.post('/disconnect', authenticate, tenantScope, requireOrg, requireAdmin, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM hubspot_connections WHERE organization_id = $1`,
      [req.organizationId]
    );

    audit.log({
      action: 'hubspot.disconnect',
      actorId: req.user.id,
      organizationId: req.organizationId,
    });

    return res.json({ success: true, message: 'HubSpot disconnected.' });
  } catch (err) {
    logger.error('HubSpot disconnect failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
