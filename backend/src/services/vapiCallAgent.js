'use strict';

/**
 * vapiCallAgent.js
 *
 * Orchestrator for the Vapi phone call agent.
 *
 * Responsibilities:
 *  1. processDiscordLeads()   — Scans for new Discord leads with phone
 *                               numbers and no prior call attempt, then
 *                               initiates outbound AI calls via Vapi.
 *  2. runCallResultSync()     — Polls in-flight calls (status: initiated /
 *                               ringing / in-progress) and refreshes their
 *                               status from the Vapi API.
 *  3. getCallLogs(limit)      — Returns recent phone_calls rows for the dashboard.
 *  4. getAgentStatus()        — Returns current agent config from system_settings.
 *
 * Mirrors the pattern in aiAgent.js.
 */

const db = require('../config/database');
const logger = require('../utils/logger');
const { createNotification } = require('./notifications');
const { logAction } = require('./audit');
const {
  initiateCall,
  getCallStatus,
  buildAssistantOverrides,
} = require('./vapiCaller');

const { getSetting } = require('../utils/settings');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// processDiscordLeads — main call-initiation loop
// ---------------------------------------------------------------------------

/**
 * Finds new Discord leads that:
 *   - have a phone number
 *   - have NOT already been called (no row in phone_calls, OR only
 *     failed rows that have not exceeded max retries)
 *
 * Then initiates an outbound Vapi call for each and stores the result
 * in phone_calls.
 *
 * @returns {Promise<{initiated: number, skipped: number, errors: number}>}
 */
async function processDiscordLeads() {
  const enabled = await getSetting('vapi_call_enabled', 'false');
  if (enabled !== 'true' && enabled !== true) {
    logger.debug('Vapi call agent is disabled, skipping run');
    return { initiated: 0, skipped: 0, errors: 0 };
  }

  const sourceFilter = (await getSetting('vapi_call_source_filter', 'discord')) || 'discord';
  const maxRetries = parseInt(await getSetting('vapi_max_retries', '1'), 10) || 1;

  logger.info('Vapi call agent: scanning for Discord leads', { sourceFilter });

  // Find leads whose source_detail or webhook source name contains the filter keyword,
  // source_type = 'webhook', have a phone number, and either:
  //   a) No entry in phone_calls yet, OR
  //   b) Only failed/no-answer entries under the retry limit
  const leadsResult = await db.query(
    `SELECT l.id, l.full_name, l.email, l.phone, l.brand_id,
            l.project_details, l.industry, l.lead_type, l.source_detail,
            COALESCE(pc_agg.attempt_count, 0) AS attempt_count,
            COALESCE(pc_agg.last_status, 'none') AS last_call_status
     FROM leads l
     LEFT JOIN (
       SELECT lead_id,
              COUNT(*) AS attempt_count,
              (ARRAY_AGG(status ORDER BY created_at DESC))[1] AS last_status
       FROM phone_calls
       GROUP BY lead_id
     ) pc_agg ON pc_agg.lead_id = l.id
     WHERE l.source_type = 'webhook'
       AND l.phone IS NOT NULL
       AND l.phone != ''
       AND LOWER(COALESCE(l.source_detail, '')) LIKE LOWER($1)
       AND l.unsubscribed = false
       AND (
         -- Never called
         pc_agg.lead_id IS NULL
         OR
         -- Previously failed/no-answer but under retry limit
         (
           pc_agg.last_status IN ('failed', 'no-answer', 'busy')
           AND pc_agg.attempt_count < $2
         )
       )
     ORDER BY l.created_at ASC
     LIMIT 50`,
    [`%${sourceFilter}%`, maxRetries + 1]
  );

  const leads = leadsResult.rows;
  logger.info(`Vapi call agent: found ${leads.length} uncalled Discord lead(s)`);

  let initiated = 0;
  let skipped = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      const overrides = buildAssistantOverrides(lead);

      // Insert a queued row first so we can track even if Vapi call fails
      const insertResult = await db.query(
        `INSERT INTO phone_calls
           (lead_id, brand_id, status, phone_number, retry_count, created_at, updated_at)
         VALUES ($1, $2, 'queued', $3, $4, NOW(), NOW())
         RETURNING id`,
        [lead.id, lead.brand_id || null, lead.phone, lead.attempt_count]
      );
      const callRowId = insertResult.rows[0].id;

      // Initiate the call
      let vapiCall;
      try {
        vapiCall = await initiateCall({
          phoneNumber: lead.phone,
          assistantOverrides: overrides,
          metadata: {
            leadId: lead.id,
            leadName: lead.full_name,
            leadEmail: lead.email,
            callRowId,
            source: 'coldaf-discord-agent',
          },
        });
      } catch (vapiErr) {
        // Update the row to failed
        await db.query(
          `UPDATE phone_calls
           SET status = 'failed', error_message = $1, updated_at = NOW()
           WHERE id = $2`,
          [vapiErr.message, callRowId]
        );

        logger.error('Vapi call failed to initiate', {
          leadId: lead.id,
          phone: lead.phone,
          error: vapiErr.message,
        });
        errors++;
        continue;
      }

      // Update the row with Vapi call details
      await db.query(
        `UPDATE phone_calls
         SET vapi_call_id = $1,
             status = $2,
             vapi_assistant_id = $3,
             initiated_at = NOW(),
             updated_at = NOW()
         WHERE id = $4`,
        [
          vapiCall.id,
          vapiCall.status || 'initiated',
          vapiCall.assistantId || null,
          callRowId,
        ]
      );

      // Audit log
      await logAction({
        actorName: 'Vapi Call Agent',
        actionType: 'phone_call.initiated',
        targetType: 'lead',
        targetId: lead.id,
        description: `Vapi call initiated to ${lead.full_name} (${lead.phone}) — Vapi ID: ${vapiCall.id}`,
        metadata: { vapiCallId: vapiCall.id, phone: lead.phone },
      });

      logger.info('Vapi call initiated successfully', {
        leadId: lead.id,
        vapiCallId: vapiCall.id,
        phone: lead.phone,
      });

      initiated++;

      // Small delay between calls to avoid hammering the API
      await new Promise((r) => setTimeout(r, 800));
    } catch (err) {
      logger.error('Unexpected error processing Discord lead for call', {
        leadId: lead.id,
        error: err.message,
        stack: err.stack,
      });
      errors++;
    }
  }

  // Update last run timestamp
  await db.query(
    `INSERT INTO system_settings (key, value, description)
     VALUES ('vapi_agent_last_run_at', $1, 'Timestamp of last Vapi agent scan run')
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(new Date().toISOString())]
  );

  logger.info('Vapi call agent run complete', { initiated, skipped, errors });
  return { initiated, skipped, errors };
}

// ---------------------------------------------------------------------------
// runCallResultSync — refresh in-flight call statuses from Vapi
// ---------------------------------------------------------------------------

/**
 * Polls phone_calls rows that are in an in-flight state and fetches
 * their latest status from Vapi. Updates the DB with any changes.
 *
 * @returns {Promise<{synced: number, errors: number}>}
 */
async function runCallResultSync() {
  const inFlightResult = await db.query(
    `SELECT id, vapi_call_id FROM phone_calls
     WHERE status IN ('queued', 'initiated', 'ringing', 'in-progress')
       AND vapi_call_id IS NOT NULL
       AND created_at >= NOW() - INTERVAL '24 hours'
     ORDER BY created_at ASC
     LIMIT 100`
  );

  const rows = inFlightResult.rows;
  if (rows.length === 0) return { synced: 0, errors: 0 };

  logger.info(`Vapi call agent: syncing ${rows.length} in-flight call(s)`);

  let synced = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const vapiCall = await getCallStatus(row.vapi_call_id);
      await updateCallFromVapi(row.id, vapiCall);
      synced++;
    } catch (err) {
      logger.error('Failed to sync Vapi call status', {
        callRowId: row.id,
        vapiCallId: row.vapi_call_id,
        error: err.message,
      });
      errors++;
    }
    // Small delay
    await new Promise((r) => setTimeout(r, 200));
  }

  return { synced, errors };
}

// ---------------------------------------------------------------------------
// updateCallFromVapi — update a phone_calls row from a Vapi call object
// ---------------------------------------------------------------------------

/**
 * Applies a Vapi call object's fields to the corresponding phone_calls row.
 * Called by both the webhook receiver and the sync poller.
 *
 * @param {string} callRowId  - UUID of the phone_calls row
 * @param {Object} vapiCall   - Vapi call object from the API or webhook
 */
async function updateCallFromVapi(callRowId, vapiCall) {
  const status = mapVapiStatus(vapiCall.status);
  const duration = vapiCall.endedAt && vapiCall.startedAt
    ? Math.round((new Date(vapiCall.endedAt) - new Date(vapiCall.startedAt)) / 1000)
    : null;

  const transcript = vapiCall.transcript || null;
  const summary = vapiCall.analysis?.summary || vapiCall.summary || null;
  const recordingUrl = vapiCall.recordingUrl || vapiCall.stereoRecordingUrl || null;
  const endedReason = vapiCall.endedReason || null;
  const endedAt = vapiCall.endedAt ? new Date(vapiCall.endedAt) : null;

  await db.query(
    `UPDATE phone_calls
     SET status = $1,
         duration_seconds = COALESCE($2, duration_seconds),
         transcript = COALESCE($3, transcript),
         summary = COALESCE($4, summary),
         recording_url = COALESCE($5, recording_url),
         ended_reason = COALESCE($6, ended_reason),
         ended_at = COALESCE($7, ended_at),
         updated_at = NOW()
     WHERE id = $8`,
    [status, duration, transcript, summary, recordingUrl, endedReason, endedAt, callRowId]
  );

  // Notify admins on call completion
  if (['completed', 'failed', 'no-answer', 'busy'].includes(status)) {
    await createNotification({
      userId: null,
      type: 'phone_call_update',
      title: `Phone Call ${status === 'completed' ? 'Completed' : 'Ended — ' + status}`,
      message: summary
        ? `Summary: ${summary.slice(0, 200)}`
        : `Call ${status}. Duration: ${duration ? `${duration}s` : 'unknown'}.`,
      metadata: { callRowId, status, endedReason },
    });
  }
}

// ---------------------------------------------------------------------------
// mapVapiStatus — normalise Vapi status to our CHECK constraint values
// ---------------------------------------------------------------------------

function mapVapiStatus(vapiStatus) {
  const map = {
    queued: 'queued',
    ringing: 'ringing',
    'in-progress': 'in-progress',
    forwarding: 'in-progress',
    ended: 'completed',
    failed: 'failed',
    busy: 'busy',
    'no-answer': 'no-answer',
    cancelled: 'cancelled',
  };
  return map[vapiStatus] || vapiStatus || 'initiated';
}

// ---------------------------------------------------------------------------
// getCallLogs
// ---------------------------------------------------------------------------

/**
 * Returns recent phone_calls rows with lead info joined.
 *
 * @param {Object} [filters]
 * @param {number} [filters.limit=50]
 * @param {number} [filters.offset=0]
 * @param {string} [filters.status]
 * @param {string} [filters.leadId]
 * @returns {Promise<{calls: Object[], total: number}>}
 */
async function getCallLogs({ limit = 50, offset = 0, status, leadId } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`pc.status = $${idx++}`);
    params.push(status);
  }
  if (leadId) {
    conditions.push(`pc.lead_id = $${idx++}`);
    params.push(leadId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM phone_calls pc ${where}`,
    params
  );
  const total = countResult.rows[0].total;

  params.push(limit, offset);
  const dataResult = await db.query(
    `SELECT pc.id, pc.lead_id, pc.vapi_call_id, pc.status,
            pc.phone_number, pc.duration_seconds, pc.recording_url,
            pc.summary, pc.ended_reason, pc.retry_count,
            pc.initiated_at, pc.ended_at, pc.created_at, pc.updated_at,
            l.full_name AS lead_name, l.email AS lead_email
     FROM phone_calls pc
     LEFT JOIN leads l ON l.id = pc.lead_id
     ${where}
     ORDER BY pc.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return { calls: dataResult.rows, total };
}

// ---------------------------------------------------------------------------
// getAgentStatus
// ---------------------------------------------------------------------------

/**
 * Returns the current Vapi agent configuration from system_settings.
 *
 * @returns {Promise<Object>}
 */
async function getAgentStatus() {
  const keys = [
    'vapi_call_enabled',
    'vapi_call_source_filter',
    'vapi_retry_on_no_answer',
    'vapi_max_retries',
    'vapi_call_delay_hours',
    'vapi_schedule_interval_minutes',
    'vapi_agent_last_run_at',
    'vapi_custom_first_message',
    'vapi_system_prompt',
    'vapi_knowledge_enabled',
  ];

  const result = await db.query(
    `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
    [keys]
  );

  const settings = {};
  for (const row of result.rows) {
    let val = row.value;
    if (typeof val === 'string') val = val.replace(/^"|"$/g, '');
    settings[row.key] = val;
  }

  return settings;
}

// ---------------------------------------------------------------------------
// getCallStats
// ---------------------------------------------------------------------------

/**
 * Returns aggregate statistics for the phone calls dashboard.
 *
 * @returns {Promise<Object>}
 */
async function getCallStats() {
  const result = await db.query(
    `SELECT
       COUNT(*)::int AS total_calls,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
       COUNT(*) FILTER (WHERE status = 'no-answer')::int AS no_answer,
       COUNT(*) FILTER (WHERE status = 'busy')::int AS busy,
       COUNT(*) FILTER (WHERE status IN ('queued','initiated','ringing','in-progress'))::int AS in_flight,
       ROUND(AVG(duration_seconds) FILTER (WHERE status = 'completed'))::int AS avg_duration_seconds,
       COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS calls_today
     FROM phone_calls`
  );

  return result.rows[0];
}

module.exports = {
  processDiscordLeads,
  runCallResultSync,
  updateCallFromVapi,
  getCallLogs,
  getAgentStatus,
  getCallStats,
};
