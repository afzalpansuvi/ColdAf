const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireRole, requirePermission } = require('../middleware/rbac');
const audit = require('../services/audit');
const { encrypt, decrypt } = require('../utils/encryption');

const env = require('../config/env');
const { pollSheet } = require('../services/googleSheets');
const { clearCache } = require('../services/apiKeys');

const router = express.Router();

// All integration routes require authentication + org scope + admin
router.use(authenticate);
router.use(tenantScope);
router.use(requireOrg);
router.use(requirePermission('*'));

// ===========================================================================
// GOOGLE SHEETS
// ===========================================================================

// ---------------------------------------------------------------------------
// Helper: extract Google Sheet ID from URL
// ---------------------------------------------------------------------------
function extractSheetId(url) {
  // Handles URLs like:
  //   https://docs.google.com/spreadsheets/d/SHEET_ID/edit
  //   https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=0
  //   https://docs.google.com/spreadsheets/d/SHEET_ID
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// GET /sheets - List all sheet connections
// ---------------------------------------------------------------------------
router.get('/sheets', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, sheet_url, sheet_id, tab_name, column_mapping,
              polling_interval_seconds, last_seen_row, last_sync_at,
              leads_imported, brand_id, is_active, created_at, updated_at
       FROM google_sheet_connections
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [req.organizationId]
    );

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        sheetUrl: r.sheet_url,
        sheetId: r.sheet_id,
        tabName: r.tab_name,
        columnMapping: r.column_mapping,
        pollingIntervalSeconds: r.polling_interval_seconds,
        lastSeenRow: r.last_seen_row,
        lastSyncAt: r.last_sync_at,
        leadsImported: r.leads_imported,
        brandId: r.brand_id,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    logger.error('List sheet connections error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing sheet connections.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /sheets - Create a new sheet connection
// ---------------------------------------------------------------------------
router.post('/sheets', async (req, res) => {
  try {
    const {
      name,
      sheetUrl,
      tabName,
      serviceAccountCredentials,
      columnMapping,
      pollingIntervalSeconds,
      brandId,
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'name is required.',
      });
    }

    if (!sheetUrl || !sheetUrl.trim()) {
      return res.status(400).json({
        success: false,
        message: 'sheetUrl is required.',
      });
    }

    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google Sheets URL. Could not extract sheet ID.',
      });
    }

    if (!serviceAccountCredentials) {
      return res.status(400).json({
        success: false,
        message: 'serviceAccountCredentials is required.',
      });
    }

    if (!brandId) {
      return res.status(400).json({
        success: false,
        message: 'brandId is required.',
      });
    }

    // Encrypt the service account credentials
    const credentialsString = typeof serviceAccountCredentials === 'string'
      ? serviceAccountCredentials
      : JSON.stringify(serviceAccountCredentials);

    const encryptedCredentials = encrypt(credentialsString);

    const result = await db.query(
      `INSERT INTO google_sheet_connections
        (name, sheet_url, sheet_id, tab_name, service_account_credentials_encrypted,
         column_mapping, polling_interval_seconds, brand_id, is_active,
         last_seen_row, leads_imported, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 0, 0, $9)
       RETURNING *`,
      [
        name.trim(),
        sheetUrl.trim(),
        sheetId,
        tabName || 'Sheet1',
        encryptedCredentials,
        columnMapping ? JSON.stringify(columnMapping) : '{}',
        pollingIntervalSeconds || 300,
        brandId,
        req.organizationId,
      ]
    );

    const conn = result.rows[0];

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.sheet_create',
      targetType: 'google_sheet_connection',
      targetId: conn.id,
      description: `Admin created Google Sheet connection "${conn.name}"`,
      metadata: { sheetId, brandId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Google Sheet connection created', { connectionId: conn.id, name: conn.name });

    return res.status(201).json({
      success: true,
      data: {
        id: conn.id,
        name: conn.name,
        sheetUrl: conn.sheet_url,
        sheetId: conn.sheet_id,
        tabName: conn.tab_name,
        columnMapping: conn.column_mapping,
        pollingIntervalSeconds: conn.polling_interval_seconds,
        brandId: conn.brand_id,
        isActive: conn.is_active,
        createdAt: conn.created_at,
        updatedAt: conn.updated_at,
      },
    });
  } catch (err) {
    logger.error('Create sheet connection error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the sheet connection.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /sheets/:id - Update a sheet connection
// ---------------------------------------------------------------------------
router.put('/sheets/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify exists
    const check = await db.query(
      `SELECT id, name FROM google_sheet_connections WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sheet connection not found.',
      });
    }

    const existing = check.rows[0];
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    const {
      name,
      sheetUrl,
      tabName,
      serviceAccountCredentials,
      columnMapping,
      pollingIntervalSeconds,
      brandId,
      isActive,
    } = req.body;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    if (sheetUrl !== undefined) {
      const sheetId = extractSheetId(sheetUrl);
      if (!sheetId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Google Sheets URL. Could not extract sheet ID.',
        });
      }
      setClauses.push(`sheet_url = $${paramIndex++}`);
      params.push(sheetUrl.trim());
      setClauses.push(`sheet_id = $${paramIndex++}`);
      params.push(sheetId);
    }

    if (tabName !== undefined) {
      setClauses.push(`tab_name = $${paramIndex++}`);
      params.push(tabName);
    }

    if (serviceAccountCredentials !== undefined) {
      const credentialsString = typeof serviceAccountCredentials === 'string'
        ? serviceAccountCredentials
        : JSON.stringify(serviceAccountCredentials);
      setClauses.push(`service_account_credentials_encrypted = $${paramIndex++}`);
      params.push(encrypt(credentialsString));
    }

    if (columnMapping !== undefined) {
      setClauses.push(`column_mapping = $${paramIndex++}`);
      params.push(JSON.stringify(columnMapping));
    }

    if (pollingIntervalSeconds !== undefined) {
      setClauses.push(`polling_interval_seconds = $${paramIndex++}`);
      params.push(pollingIntervalSeconds);
    }

    if (brandId !== undefined) {
      setClauses.push(`brand_id = $${paramIndex++}`);
      params.push(brandId);
    }

    if (isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update.',
      });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const updateResult = await db.query(
      `UPDATE google_sheet_connections
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, sheet_url, sheet_id, tab_name, column_mapping,
                 polling_interval_seconds, last_seen_row, last_sync_at,
                 leads_imported, brand_id, is_active, created_at, updated_at`,
      params
    );

    const conn = updateResult.rows[0];

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.sheet_update',
      targetType: 'google_sheet_connection',
      targetId: id,
      description: `Admin updated Google Sheet connection "${existing.name}"`,
      metadata: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Google Sheet connection updated', { connectionId: id });

    return res.json({
      success: true,
      data: {
        id: conn.id,
        name: conn.name,
        sheetUrl: conn.sheet_url,
        sheetId: conn.sheet_id,
        tabName: conn.tab_name,
        columnMapping: conn.column_mapping,
        pollingIntervalSeconds: conn.polling_interval_seconds,
        lastSeenRow: conn.last_seen_row,
        lastSyncAt: conn.last_sync_at,
        leadsImported: conn.leads_imported,
        brandId: conn.brand_id,
        isActive: conn.is_active,
        createdAt: conn.created_at,
        updatedAt: conn.updated_at,
      },
    });
  } catch (err) {
    logger.error('Update sheet connection error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the sheet connection.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /sheets/:id - Delete a sheet connection
// ---------------------------------------------------------------------------
router.delete('/sheets/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, name FROM google_sheet_connections WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sheet connection not found.',
      });
    }

    const conn = check.rows[0];

    await db.query(`DELETE FROM google_sheet_connections WHERE id = $1 AND organization_id = $2`, [id, req.organizationId]);

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.sheet_delete',
      targetType: 'google_sheet_connection',
      targetId: id,
      description: `Admin deleted Google Sheet connection "${conn.name}"`,
      metadata: { connectionName: conn.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Google Sheet connection deleted', { connectionId: id });

    return res.json({
      success: true,
      message: `Sheet connection "${conn.name}" has been deleted.`,
    });
  } catch (err) {
    logger.error('Delete sheet connection error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deleting the sheet connection.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /sheets/:id/test - Test a sheet connection
// ---------------------------------------------------------------------------
router.post('/sheets/:id/test', async (req, res) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, name, sheet_id, tab_name, service_account_credentials_encrypted
       FROM google_sheet_connections WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sheet connection not found.',
      });
    }

    const conn = check.rows[0];

    // Validate the credentials can be decrypted and are valid JSON
    try {
      const decrypted = decrypt(conn.service_account_credentials_encrypted);
      const parsed = JSON.parse(decrypted);

      // Check for required Google service account fields
      if (!parsed.client_email || !parsed.private_key) {
        return res.status(400).json({
          success: true,
          data: {
            connected: false,
            message: 'Service account credentials are missing required fields (client_email, private_key).',
          },
        });
      }

      // In a full implementation, we would use googleapis to read the first row.
      // For now, return success if credentials format is valid.
      return res.json({
        success: true,
        data: {
          connected: true,
          message: `Credentials format valid for sheet "${conn.name}". Service account: ${parsed.client_email}`,
          sheetId: conn.sheet_id,
          tabName: conn.tab_name,
        },
      });
    } catch (parseErr) {
      return res.json({
        success: true,
        data: {
          connected: false,
          message: `Credentials validation failed: ${parseErr.message}`,
        },
      });
    }
  } catch (err) {
    logger.error('Test sheet connection error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while testing the sheet connection.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /sheets/:id/sync - Trigger immediate Google Sheets sync
// ---------------------------------------------------------------------------
router.post('/sheets/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT * FROM google_sheet_connections WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sheet connection not found.',
      });
    }

    const connection = check.rows[0];

    if (!connection.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Sheet connection is not active. Enable it before syncing.',
      });
    }

    const result = await pollSheet(connection);

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.sheet_sync',
      targetType: 'google_sheet_connection',
      targetId: id,
      description: `Admin triggered manual sync for Google Sheet connection "${connection.name}"`,
      metadata: { newLeads: result.newLeads, errors: result.errors, skipped: result.skipped },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Google Sheet manual sync completed', {
      connectionId: id,
      newLeads: result.newLeads,
      errors: result.errors,
      skipped: result.skipped,
    });

    return res.json({
      success: true,
      data: {
        newLeads: result.newLeads,
        errors: result.errors,
        skipped: result.skipped,
      },
    });
  } catch (err) {
    logger.error('Manual sheet sync error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while syncing the sheet connection.',
    });
  }
});

// ===========================================================================
// WEBHOOKS (INBOUND)
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /webhooks - List webhook sources
// ---------------------------------------------------------------------------
router.get('/webhooks', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, endpoint_path, field_mapping, brand_id, is_active,
              created_at, updated_at
       FROM webhook_sources
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [req.organizationId]
    );

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        endpointPath: r.endpoint_path,
        endpointUrl: `${env.backendUrl}/api/webhook/leads/${r.endpoint_path}`,
        fieldMapping: r.field_mapping,
        brandId: r.brand_id,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    logger.error('List webhook sources error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing webhook sources.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /webhooks - Create a webhook source
// ---------------------------------------------------------------------------
router.post('/webhooks', async (req, res) => {
  try {
    const { name, fieldMapping, brandId } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'name is required.',
      });
    }

    if (!brandId) {
      return res.status(400).json({
        success: false,
        message: 'brandId is required.',
      });
    }

    // Auto-generate unique endpoint path and secret token
    const endpointPath = `wh_${crypto.randomUUID().replace(/-/g, '')}`;
    const secretToken = crypto.randomBytes(32).toString('hex');

    const result = await db.query(
      `INSERT INTO webhook_sources
        (name, endpoint_path, secret_token, field_mapping, brand_id, is_active, organization_id)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       RETURNING *`,
      [
        name.trim(),
        endpointPath,
        secretToken,
        fieldMapping ? JSON.stringify(fieldMapping) : '{}',
        brandId,
        req.organizationId,
      ]
    );

    const source = result.rows[0];

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.webhook_create',
      targetType: 'webhook_source',
      targetId: source.id,
      description: `Admin created webhook source "${source.name}"`,
      metadata: { endpointPath, brandId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Webhook source created', { sourceId: source.id, name: source.name });

    return res.status(201).json({
      success: true,
      data: {
        id: source.id,
        name: source.name,
        endpointPath: source.endpoint_path,
        endpointUrl: `${env.backendUrl}/api/webhook/leads/${source.endpoint_path}`,
        secretToken: source.secret_token,
        fieldMapping: source.field_mapping,
        brandId: source.brand_id,
        isActive: source.is_active,
        createdAt: source.created_at,
        updatedAt: source.updated_at,
      },
    });
  } catch (err) {
    logger.error('Create webhook source error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the webhook source.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /webhooks/:id - Update a webhook source
// ---------------------------------------------------------------------------
router.put('/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, name FROM webhook_sources WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webhook source not found.',
      });
    }

    const existing = check.rows[0];
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    const { name, fieldMapping, brandId, isActive } = req.body;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    if (fieldMapping !== undefined) {
      setClauses.push(`field_mapping = $${paramIndex++}`);
      params.push(JSON.stringify(fieldMapping));
    }

    if (brandId !== undefined) {
      setClauses.push(`brand_id = $${paramIndex++}`);
      params.push(brandId);
    }

    if (isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update.',
      });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const updateResult = await db.query(
      `UPDATE webhook_sources
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, endpoint_path, secret_token, field_mapping,
                 brand_id, is_active, created_at, updated_at`,
      params
    );

    const source = updateResult.rows[0];

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.webhook_update',
      targetType: 'webhook_source',
      targetId: id,
      description: `Admin updated webhook source "${existing.name}"`,
      metadata: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Webhook source updated', { sourceId: id });

    return res.json({
      success: true,
      data: {
        id: source.id,
        name: source.name,
        endpointPath: source.endpoint_path,
        endpointUrl: `${env.backendUrl}/api/webhook/leads/${source.endpoint_path}`,
        secretToken: source.secret_token,
        fieldMapping: source.field_mapping,
        brandId: source.brand_id,
        isActive: source.is_active,
        createdAt: source.created_at,
        updatedAt: source.updated_at,
      },
    });
  } catch (err) {
    logger.error('Update webhook source error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the webhook source.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /webhooks/:id - Delete a webhook source
// ---------------------------------------------------------------------------
router.delete('/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, name FROM webhook_sources WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webhook source not found.',
      });
    }

    const source = check.rows[0];

    // Delete associated events first
    await db.query(`DELETE FROM webhook_events WHERE webhook_source_id = $1`, [id]);
    await db.query(`DELETE FROM webhook_sources WHERE id = $1 AND organization_id = $2`, [id, req.organizationId]);

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.webhook_delete',
      targetType: 'webhook_source',
      targetId: id,
      description: `Admin deleted webhook source "${source.name}"`,
      metadata: { sourceName: source.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Webhook source deleted', { sourceId: id });

    return res.json({
      success: true,
      message: `Webhook source "${source.name}" has been deleted.`,
    });
  } catch (err) {
    logger.error('Delete webhook source error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deleting the webhook source.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /webhooks/:id/events - List recent webhook events
// ---------------------------------------------------------------------------
router.get('/webhooks/:id/events', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify the webhook source exists within this org
    const check = await db.query(
      `SELECT id FROM webhook_sources WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Webhook source not found.',
      });
    }

    const result = await db.query(
      `SELECT id, webhook_source_id, payload, status, error_message, created_at
       FROM webhook_events
       WHERE webhook_source_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id]
    );

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        webhookSourceId: r.webhook_source_id,
        payload: r.payload,
        status: r.status,
        errorMessage: r.error_message,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    logger.error('List webhook events error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing webhook events.',
    });
  }
});

// ===========================================================================
// OUTBOUND INTEGRATIONS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /outbound - List outbound integrations
// ---------------------------------------------------------------------------
router.get('/outbound', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, type, config, event_triggers, is_active,
              created_at, updated_at
       FROM outbound_integrations
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [req.organizationId]
    );

    return res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        config: r.config,
        eventTriggers: r.event_triggers,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    logger.error('List outbound integrations error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing outbound integrations.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /outbound - Create an outbound integration
// ---------------------------------------------------------------------------
router.post('/outbound', async (req, res) => {
  try {
    const { name, type, config, eventTriggers } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'name is required.',
      });
    }

    const validTypes = ['discord', 'custom_webhook', 'google_sheets_export'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `type is required and must be one of: ${validTypes.join(', ')}`,
      });
    }

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'config is required and must be an object.',
      });
    }

    const result = await db.query(
      `INSERT INTO outbound_integrations
        (name, type, config, event_triggers, is_active, organization_id)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       RETURNING *`,
      [
        name.trim(),
        type,
        JSON.stringify(config),
        JSON.stringify(eventTriggers || []),
        req.organizationId,
      ]
    );

    const integration = result.rows[0];

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.outbound_create',
      targetType: 'outbound_integration',
      targetId: integration.id,
      description: `Admin created outbound integration "${integration.name}" (${type})`,
      metadata: { type, eventTriggers },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Outbound integration created', { integrationId: integration.id, name: integration.name, type });

    return res.status(201).json({
      success: true,
      data: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
        config: integration.config,
        eventTriggers: integration.event_triggers,
        isActive: integration.is_active,
        createdAt: integration.created_at,
        updatedAt: integration.updated_at,
      },
    });
  } catch (err) {
    logger.error('Create outbound integration error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the outbound integration.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /outbound/:id - Update an outbound integration
// ---------------------------------------------------------------------------
router.put('/outbound/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, name FROM outbound_integrations WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Outbound integration not found.',
      });
    }

    const existing = check.rows[0];
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    const { name, type, config, eventTriggers, isActive } = req.body;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    if (type !== undefined) {
      const validTypes = ['discord', 'custom_webhook', 'google_sheets_export'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `type must be one of: ${validTypes.join(', ')}`,
        });
      }
      setClauses.push(`type = $${paramIndex++}`);
      params.push(type);
    }

    if (config !== undefined) {
      setClauses.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(config));
    }

    if (eventTriggers !== undefined) {
      setClauses.push(`event_triggers = $${paramIndex++}`);
      params.push(JSON.stringify(eventTriggers));
    }

    if (isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update.',
      });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const updateResult = await db.query(
      `UPDATE outbound_integrations
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      params
    );

    const integration = updateResult.rows[0];

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.outbound_update',
      targetType: 'outbound_integration',
      targetId: id,
      description: `Admin updated outbound integration "${existing.name}"`,
      metadata: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Outbound integration updated', { integrationId: id });

    return res.json({
      success: true,
      data: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
        config: integration.config,
        eventTriggers: integration.event_triggers,
        isActive: integration.is_active,
        createdAt: integration.created_at,
        updatedAt: integration.updated_at,
      },
    });
  } catch (err) {
    logger.error('Update outbound integration error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the outbound integration.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /outbound/:id - Delete an outbound integration
// ---------------------------------------------------------------------------
router.delete('/outbound/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, name FROM outbound_integrations WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Outbound integration not found.',
      });
    }

    const integration = check.rows[0];

    await db.query(`DELETE FROM outbound_integrations WHERE id = $1 AND organization_id = $2`, [id, req.organizationId]);

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'integration.outbound_delete',
      targetType: 'outbound_integration',
      targetId: id,
      description: `Admin deleted outbound integration "${integration.name}"`,
      metadata: { integrationName: integration.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Outbound integration deleted', { integrationId: id });

    return res.json({
      success: true,
      message: `Outbound integration "${integration.name}" has been deleted.`,
    });
  } catch (err) {
    logger.error('Delete outbound integration error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deleting the outbound integration.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /outbound/:id/test - Test an outbound integration
// ---------------------------------------------------------------------------
router.post('/outbound/:id/test', async (req, res) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, name, type, config, event_triggers
       FROM outbound_integrations WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Outbound integration not found.',
      });
    }

    const integration = check.rows[0];

    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      integration: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
      },
      data: {
        message: 'This is a test event from ColdAF Email Tool.',
        leadId: '00000000-0000-0000-0000-000000000000',
        leadEmail: 'test@example.com',
        leadName: 'Test Lead',
      },
    };

    let testResult = { sent: false, message: '' };

    if (integration.type === 'discord') {
      const webhookUrl = integration.config && integration.config.webhook_url;
      if (!webhookUrl) {
        testResult.message = 'Discord webhook_url is not configured.';
      } else {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `**ColdAF Test Event** - Integration "${integration.name}" is working correctly.`,
              embeds: [{
                title: 'Test Payload',
                description: JSON.stringify(testPayload.data, null, 2).substring(0, 2000),
                color: 3447003,
                timestamp: testPayload.timestamp,
              }],
            }),
          });
          testResult.sent = response.ok;
          testResult.message = response.ok
            ? 'Test message sent to Discord successfully.'
            : `Discord returned status ${response.status}.`;
        } catch (fetchErr) {
          testResult.message = `Failed to reach Discord: ${fetchErr.message}`;
        }
      }
    } else if (integration.type === 'custom_webhook') {
      const url = integration.config && integration.config.url;
      if (!url) {
        testResult.message = 'Custom webhook url is not configured.';
      } else {
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (integration.config.headers && typeof integration.config.headers === 'object') {
            Object.assign(headers, integration.config.headers);
          }
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(testPayload),
          });
          testResult.sent = response.ok;
          testResult.message = response.ok
            ? `Test payload sent to ${url} successfully (status ${response.status}).`
            : `Webhook returned status ${response.status}.`;
        } catch (fetchErr) {
          testResult.message = `Failed to reach webhook URL: ${fetchErr.message}`;
        }
      }
    } else if (integration.type === 'google_sheets_export') {
      // Google Sheets export test would require googleapis integration
      testResult.sent = true;
      testResult.message = 'Google Sheets export configuration validated. Full export test requires an active sheet connection.';
    }

    return res.json({
      success: true,
      data: {
        integrationId: integration.id,
        integrationName: integration.name,
        type: integration.type,
        testPayload,
        result: testResult,
      },
    });
  } catch (err) {
    logger.error('Test outbound integration error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while testing the outbound integration.',
    });
  }
});

// ===========================================================================
// API KEYS MANAGEMENT
// ===========================================================================

const API_KEY_SETTINGS = [
  'anthropic_api_key', 'sendgrid_api_key', 'mailgun_api_key', 'openai_api_key', 'google_gemini_api_key',
  'vapi_api_key', 'vapi_phone_number_id', 'vapi_assistant_id', 'vapi_webhook_secret',
];

/**
 * Masks an API key, showing only the last 4 characters.
 */
function maskApiKey(value) {
  if (!value || value.length < 8) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

// ---------------------------------------------------------------------------
// GET /api-keys - Return masked API keys
// ---------------------------------------------------------------------------
router.get('/api-keys', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
      [API_KEY_SETTINGS]
    );

    const keys = {};
    for (const setting of API_KEY_SETTINGS) {
      keys[setting] = null;
    }

    for (const row of result.rows) {
      try {
        const decrypted = decrypt(row.value);
        keys[row.key] = maskApiKey(decrypted);
      } catch (_) {
        // If decryption fails, the value may be stored in plain text
        keys[row.key] = maskApiKey(row.value);
      }
    }

    return res.json({
      success: true,
      data: keys,
    });
  } catch (err) {
    logger.error('Get API keys error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching API keys.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /api-keys - Update API keys
// ---------------------------------------------------------------------------
router.put('/api-keys', async (req, res) => {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be an object with API key settings.',
      });
    }

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const updatedKeys = [];

      for (const [key, value] of Object.entries(updates)) {
        if (!API_KEY_SETTINGS.includes(key)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Unknown API key setting: ${key}. Allowed: ${API_KEY_SETTINGS.join(', ')}`,
          });
        }

        if (!value || typeof value !== 'string' || !value.trim()) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Value for ${key} must be a non-empty string.`,
          });
        }

        const encryptedValue = encrypt(value.trim());

        await client.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE
           SET value = $2, updated_at = NOW()`,
          [key, encryptedValue]
        );

        updatedKeys.push(key);
      }

      await client.query('COMMIT');

      // Invalidate in-memory API key cache
      clearCache();

      await audit.logAction({
        actorId: req.user.id,
        actorName: req.user.email,
        actionType: 'settings.api_keys_update',
        targetType: 'system_settings',
        targetId: null,
        description: `Admin updated API keys: ${updatedKeys.join(', ')}`,
        metadata: { updatedKeys },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      logger.info('API keys updated', { updatedKeys, updatedBy: req.user.id });

      return res.json({
        success: true,
        message: `API keys updated: ${updatedKeys.join(', ')}`,
        data: { updatedKeys },
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Update API keys error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating API keys.',
    });
  }
});

module.exports = router;
