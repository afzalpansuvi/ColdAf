'use strict';

/**
 * phoneCalls.js — REST API routes for the Vapi phone call agent.
 *
 * All routes require authentication. Admin-only routes are marked with
 * requireRole('admin').
 *
 * Endpoints:
 *   GET  /api/phone-calls              — List calls
 *   GET  /api/phone-calls/stats        — Aggregate stats
 *   GET  /api/phone-calls/agent/status — Agent settings
 *   PUT  /api/phone-calls/agent/settings — Update agent settings
 *   POST /api/phone-calls/trigger      — Manually trigger agent scan
 *   POST /api/phone-calls/sync         — Sync in-flight call statuses from Vapi
 *   GET  /api/phone-calls/:id          — Single call detail
 *   POST /api/phone-calls/call-lead/:leadId — Manually call a specific lead
 */

const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireRole, requirePermission } = require('../middleware/rbac');
const audit = require('../services/audit');
const {
  processDiscordLeads,
  runCallResultSync,
  getCallLogs,
  getAgentStatus,
  getCallStats,
} = require('../services/vapiCallAgent');
const { initiateCall, buildAssistantOverrides } = require('../services/vapiCaller');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /stats — aggregate statistics
// ---------------------------------------------------------------------------
router.get('/stats', authenticate, tenantScope, async (req, res) => {
  try {
    const stats = await getCallStats();
    return res.json({ success: true, data: stats });
  } catch (err) {
    logger.error('Phone call stats error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

// ---------------------------------------------------------------------------
// GET /agent/status — return current agent settings
// ---------------------------------------------------------------------------
router.get('/agent/status', authenticate, tenantScope, requirePermission('phone_calls.view'), async (req, res) => {
  try {
    const settings = await getAgentStatus();
    return res.json({ success: true, data: settings });
  } catch (err) {
    logger.error('Agent status error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch agent status.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /agent/settings — update agent settings
// ---------------------------------------------------------------------------
router.put('/agent/settings', authenticate, tenantScope, requireRole('admin'), async (req, res) => {
  try {
    const allowedKeys = [
      'vapi_call_enabled',
      'vapi_call_source_filter',
      'vapi_retry_on_no_answer',
      'vapi_max_retries',
      'vapi_call_delay_hours',
      'vapi_schedule_interval_minutes',
    ];

    const updates = [];
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        const val = req.body[key];
        await db.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, JSON.stringify(val)]
        );
        updates.push(key);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid settings provided.' });
    }

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'phone_call_agent.settings_update',
      targetType: 'system',
      targetId: null,
      description: `Vapi call agent settings updated: ${updates.join(', ')}`,
      metadata: req.body,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const settings = await getAgentStatus();
    return res.json({ success: true, data: settings });
  } catch (err) {
    logger.error('Update agent settings error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
});

// ---------------------------------------------------------------------------
// POST /trigger — manually trigger the agent scan for Discord leads
// ---------------------------------------------------------------------------
router.post('/trigger', authenticate, tenantScope, requireRole('admin'), async (req, res) => {
  try {
    logger.info('Manual Vapi agent trigger', { triggeredBy: req.user.email });

    // Run async — respond immediately so the HTTP request doesn't time out
    const result = await processDiscordLeads();

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'phone_call_agent.triggered',
      targetType: 'system',
      targetId: null,
      description: `Vapi call agent manually triggered. Initiated: ${result.initiated}, Errors: ${result.errors}`,
      metadata: result,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Agent trigger error', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /sync — sync in-flight call statuses from Vapi
// ---------------------------------------------------------------------------
router.post('/sync', authenticate, tenantScope, requireRole('admin'), async (req, res) => {
  try {
    const result = await runCallResultSync();
    return res.json({ success: true, data: result });
  } catch (err) {
    logger.error('Call sync error', { error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET / — list calls with optional filters
// ---------------------------------------------------------------------------
router.get('/', authenticate, tenantScope, async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 50;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const offset = (page - 1) * limit;

    const { calls, total } = await getCallLogs({
      limit,
      offset,
      status: req.query.status || undefined,
      leadId: req.query.lead_id || undefined,
    });

    return res.json({
      success: true,
      data: {
        calls,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    logger.error('List phone calls error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to list calls.' });
  }
});

// ---------------------------------------------------------------------------
// POST /call-lead/:leadId — manually initiate a call for a specific lead
// ---------------------------------------------------------------------------
router.post('/call-lead/:leadId', authenticate, tenantScope, requireOrg, requirePermission('phone_calls.manage'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const leadResult = await db.query(
      `SELECT id, full_name, email, phone, brand_id, project_details, industry
       FROM leads WHERE id = $1 AND organization_id = $2`,
      [leadId, req.organizationId]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }

    const lead = leadResult.rows[0];

    if (!lead.phone || !lead.phone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'This lead has no phone number and cannot be called.',
      });
    }

    // Insert a queued phone_calls row
    const insertResult = await db.query(
      `INSERT INTO phone_calls
         (lead_id, brand_id, status, phone_number, organization_id, created_at, updated_at)
       VALUES ($1, $2, 'queued', $3, $4, NOW(), NOW())
       RETURNING id`,
      [lead.id, lead.brand_id || null, lead.phone, req.organizationId]
    );
    const callRowId = insertResult.rows[0].id;

    // Initiate the call
    let vapiCall;
    try {
      vapiCall = await initiateCall({
        phoneNumber: lead.phone,
        assistantOverrides: await buildAssistantOverrides(lead),
        metadata: {
          leadId: lead.id,
          leadName: lead.full_name,
          leadEmail: lead.email,
          callRowId,
          source: 'coldaf-manual',
          initiatedBy: req.user.email,
        },
      });
    } catch (vapiErr) {
      await db.query(
        `UPDATE phone_calls SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [vapiErr.message, callRowId]
      );
      return res.status(502).json({ success: false, message: `Vapi error: ${vapiErr.message}` });
    }

    // Update the row with Vapi details
    await db.query(
      `UPDATE phone_calls
       SET vapi_call_id = $1, status = $2, vapi_assistant_id = $3,
           initiated_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [vapiCall.id, vapiCall.status || 'initiated', vapiCall.assistantId || null, callRowId]
    );

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'phone_call.manual_initiate',
      targetType: 'lead',
      targetId: lead.id,
      description: `Manual Vapi call initiated to ${lead.full_name} (${lead.phone})`,
      metadata: { vapiCallId: vapiCall.id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(201).json({
      success: true,
      data: {
        callRowId,
        vapiCallId: vapiCall.id,
        status: vapiCall.status || 'initiated',
      },
    });
  } catch (err) {
    logger.error('Manual call error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to initiate call.' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id — single call detail
// ---------------------------------------------------------------------------
router.get('/:id', authenticate, tenantScope, requireOrg, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT pc.*, l.full_name AS lead_name, l.email AS lead_email, l.phone AS lead_phone
       FROM phone_calls pc
       LEFT JOIN leads l ON l.id = pc.lead_id
       WHERE pc.id = $1 AND pc.organization_id = $2`,
      [req.params.id, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Call not found.' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Get phone call error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch call.' });
  }
});

// ===========================================================================
// CALL SCRIPT MANAGEMENT
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /agent/call-script — return current call script settings
// ---------------------------------------------------------------------------
router.get('/agent/call-script', authenticate, tenantScope, requirePermission('phone_calls.call_script.view'), async (req, res) => {
  try {
    const keys = ['vapi_custom_first_message', 'vapi_system_prompt', 'vapi_knowledge_enabled'];
    const result = await db.query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
      [keys]
    );

    const data = {};
    for (const row of result.rows) {
      let val = row.value;
      if (typeof val === 'string') val = val.replace(/^"|"$/g, '');
      data[row.key] = val;
    }

    return res.json({ success: true, data });
  } catch (err) {
    logger.error('Get call script error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch call script settings.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /agent/call-script — update call script settings
// ---------------------------------------------------------------------------
router.put('/agent/call-script', authenticate, tenantScope, requireRole('admin'), async (req, res) => {
  try {
    const allowedKeys = ['vapi_custom_first_message', 'vapi_system_prompt', 'vapi_knowledge_enabled'];
    const updates = [];

    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        const val = req.body[key];
        await db.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, JSON.stringify(val)]
        );
        updates.push(key);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid call script settings provided.' });
    }

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'phone_call_agent.call_script_update',
      targetType: 'system',
      targetId: null,
      description: `Call script settings updated: ${updates.join(', ')}`,
      metadata: req.body,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({ success: true, message: 'Call script settings updated.' });
  } catch (err) {
    logger.error('Update call script error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to update call script settings.' });
  }
});

// ===========================================================================
// KNOWLEDGE BASE MANAGEMENT
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /knowledge — list all knowledge entries
// ---------------------------------------------------------------------------
router.get('/knowledge', authenticate, tenantScope, requireOrg, requirePermission('phone_calls.knowledge.view'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, content, is_active, sort_order, created_at, updated_at
       FROM vapi_knowledge_entries
       WHERE organization_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [req.organizationId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('List knowledge entries error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to list knowledge entries.' });
  }
});

// ---------------------------------------------------------------------------
// POST /knowledge — create a knowledge entry
// ---------------------------------------------------------------------------
router.post('/knowledge', authenticate, tenantScope, requireOrg, requireRole('admin'), async (req, res) => {
  try {
    const { title, content, is_active = true, sort_order = 0 } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required.' });
    }

    const result = await db.query(
      `INSERT INTO vapi_knowledge_entries (title, content, is_active, sort_order, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [title.trim(), content.trim(), is_active, sort_order, req.organizationId]
    );

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'phone_call_agent.knowledge_create',
      targetType: 'vapi_knowledge_entry',
      targetId: result.rows[0].id,
      description: `Knowledge entry created: "${title.trim()}"`,
      metadata: { title: title.trim() },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Create knowledge entry error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to create knowledge entry.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /knowledge/:id — update a knowledge entry
// ---------------------------------------------------------------------------
router.put('/knowledge/:id', authenticate, tenantScope, requireOrg, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, is_active, sort_order } = req.body;

    const check = await db.query(
      `SELECT id FROM vapi_knowledge_entries WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Knowledge entry not found.' });
    }

    const setClauses = [];
    const params = [];
    let idx = 1;

    if (title !== undefined) { setClauses.push(`title = $${idx++}`); params.push(title.trim()); }
    if (content !== undefined) { setClauses.push(`content = $${idx++}`); params.push(content.trim()); }
    if (is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); params.push(is_active); }
    if (sort_order !== undefined) { setClauses.push(`sort_order = $${idx++}`); params.push(sort_order); }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update.' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await db.query(
      `UPDATE vapi_knowledge_entries SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'phone_call_agent.knowledge_update',
      targetType: 'vapi_knowledge_entry',
      targetId: id,
      description: `Knowledge entry updated`,
      metadata: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Update knowledge entry error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to update knowledge entry.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /knowledge/:id — delete a knowledge entry
// ---------------------------------------------------------------------------
router.delete('/knowledge/:id', authenticate, tenantScope, requireOrg, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const check = await db.query(
      `SELECT id, title FROM vapi_knowledge_entries WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Knowledge entry not found.' });
    }

    await db.query(`DELETE FROM vapi_knowledge_entries WHERE id = $1`, [id]);

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'phone_call_agent.knowledge_delete',
      targetType: 'vapi_knowledge_entry',
      targetId: id,
      description: `Knowledge entry deleted: "${check.rows[0].title}"`,
      metadata: { title: check.rows[0].title },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({ success: true, message: 'Knowledge entry deleted.' });
  } catch (err) {
    logger.error('Delete knowledge entry error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to delete knowledge entry.' });
  }
});

module.exports = router;
