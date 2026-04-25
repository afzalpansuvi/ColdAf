'use strict';

/**
 * vapiWebhook.js — Public Vapi.ai webhook receiver.
 *
 * Vapi POSTs status updates to this endpoint throughout the lifecycle
 * of a call. We verify the optional HMAC signature, look up the call
 * by vapi_call_id, and update our phone_calls table accordingly.
 *
 * Vapi webhook event types:
 *   - status-update:      call progressed to a new status
 *   - end-of-call-report: final report with transcript, summary, recording URL
 *   - function-call:      assistant wants to invoke a server-side function (not used here)
 *   - hang:               assistant requested to hang up
 *
 * Vapi docs: https://docs.vapi.ai/webhooks
 */

const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { verifyWebhookSignature } = require('../services/vapiCaller');
const { getEncryptedSetting } = require('../services/apiKeys');
const { updateCallFromVapi } = require('../services/vapiCallAgent');

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /webhook — main Vapi event receiver
// ---------------------------------------------------------------------------
router.post('/webhook', express.json({ limit: '2mb' }), async (req, res) => {
  // Respond 200 immediately — Vapi expects a fast acknowledgement
  res.status(200).json({ received: true });

  // Verify signature (non-blocking — we already sent 200)
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['x-vapi-secret'] || req.headers['x-vapi-signature'] || '';
  const webhookSecret = await getEncryptedSetting('vapi_webhook_secret');

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    logger.warn('Vapi webhook: invalid signature, ignoring payload');
    return;
  }

  const payload = req.body;
  const eventType = payload.type || payload.message?.type;

  logger.debug('Vapi webhook received', { eventType, callId: payload?.call?.id });

  // Extract the Vapi call object — its location varies by event type
  const vapiCall = payload.call || payload.message?.call || null;

  if (!vapiCall || !vapiCall.id) {
    logger.warn('Vapi webhook: no call object found in payload', { eventType });
    return;
  }

  try {
    switch (eventType) {
      case 'status-update':
        await handleStatusUpdate(vapiCall);
        break;

      case 'end-of-call-report':
        await handleEndOfCallReport(payload, vapiCall);
        break;

      case 'hang':
        // Hang means the assistant triggered a hang-up — treat as status update
        await handleStatusUpdate({ ...vapiCall, status: 'ended' });
        break;

      case 'function-call':
        // Not implemented — log and ignore
        logger.debug('Vapi webhook: function-call event (not implemented)', {
          vapiCallId: vapiCall.id,
        });
        break;

      default:
        logger.debug('Vapi webhook: unhandled event type', { eventType });
    }
  } catch (err) {
    logger.error('Vapi webhook processing error', {
      eventType,
      vapiCallId: vapiCall?.id,
      error: err.message,
      stack: err.stack,
    });
  }
});

// ---------------------------------------------------------------------------
// handleStatusUpdate — updates call status in phone_calls
// ---------------------------------------------------------------------------
async function handleStatusUpdate(vapiCall) {
  const rowResult = await db.query(
    `SELECT id FROM phone_calls WHERE vapi_call_id = $1`,
    [vapiCall.id]
  );

  if (rowResult.rows.length === 0) {
    // The call may have been initiated very recently; log and ignore
    logger.warn('Vapi webhook: status-update for unknown call ID', { vapiCallId: vapiCall.id });
    return;
  }

  const callRowId = rowResult.rows[0].id;
  await updateCallFromVapi(callRowId, vapiCall);

  logger.info('Vapi webhook: status updated', {
    callRowId,
    vapiCallId: vapiCall.id,
    status: vapiCall.status,
  });
}

// ---------------------------------------------------------------------------
// handleEndOfCallReport — full report with transcript, summary, recording
// ---------------------------------------------------------------------------
async function handleEndOfCallReport(payload, vapiCall) {
  const rowResult = await db.query(
    `SELECT id FROM phone_calls WHERE vapi_call_id = $1`,
    [vapiCall.id]
  );

  if (rowResult.rows.length === 0) {
    logger.warn('Vapi webhook: end-of-call-report for unknown call ID', {
      vapiCallId: vapiCall.id,
    });
    return;
  }

  const callRowId = rowResult.rows[0].id;

  // Merge end-of-call-report fields into the vapiCall object
  const enrichedCall = {
    ...vapiCall,
    transcript: payload.transcript || vapiCall.transcript || null,
    summary: payload.summary || payload.analysis?.summary || vapiCall.summary || null,
    recordingUrl: payload.recordingUrl || vapiCall.recordingUrl || null,
    stereoRecordingUrl: payload.stereoRecordingUrl || null,
    analysis: payload.analysis || vapiCall.analysis || null,
    endedReason: payload.endedReason || vapiCall.endedReason || 'end-of-call-report',
    endedAt: payload.call?.endedAt || vapiCall.endedAt || new Date().toISOString(),
    startedAt: payload.call?.startedAt || vapiCall.startedAt || null,
    status: 'ended',
  };

  await updateCallFromVapi(callRowId, enrichedCall);

  logger.info('Vapi webhook: end-of-call-report processed', {
    callRowId,
    vapiCallId: vapiCall.id,
    hasSummary: !!enrichedCall.summary,
    hasTranscript: !!enrichedCall.transcript,
    hasRecording: !!enrichedCall.recordingUrl,
  });
}

module.exports = router;
