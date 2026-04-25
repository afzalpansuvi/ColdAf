'use strict';

/**
 * vapiCaller.js
 *
 * Low-level Vapi.ai HTTP client.
 * Handles initiating outbound calls, fetching call status, and
 * verifying webhook signatures from Vapi.
 *
 * API reference: https://docs.vapi.ai/api-reference
 */

const https = require('https');
const crypto = require('crypto');
const env = require('../config/env');
const db = require('../config/database');
const logger = require('../utils/logger');
const { getEncryptedSetting } = require('./apiKeys');
const { getSetting } = require('../utils/settings');

const VAPI_BASE_URL = 'https://api.vapi.ai';

// ---------------------------------------------------------------------------
// Internal HTTP helper
// ---------------------------------------------------------------------------

/**
 * Makes an authenticated request to the Vapi REST API.
 *
 * @param {string} method  - HTTP method ('GET', 'POST', 'PATCH', etc.)
 * @param {string} path    - API path, e.g. '/call'
 * @param {Object} [body]  - Optional request body (will be JSON-serialised)
 * @param {string} [apiKey] - Resolved API key (DB-first, env-fallback)
 * @returns {Promise<Object>} Parsed JSON response
 */
function vapiRequest(method, path, body, apiKey) {
  return new Promise((resolve, reject) => {
    if (!apiKey) {
      return reject(new Error('VAPI_API_KEY is not configured. Set it in your .env file or via Integrations > API Keys.'));
    }

    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(VAPI_BASE_URL + path);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(
              parsed.message || parsed.error || `Vapi API error: HTTP ${res.statusCode}`
            );
            err.statusCode = res.statusCode;
            err.vapiResponse = parsed;
            return reject(err);
          }
          resolve(parsed);
        } catch (parseErr) {
          reject(new Error(`Failed to parse Vapi response: ${parseErr.message}`));
        }
      });
    });

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Resolve the Vapi API key from DB (encrypted) first, then fall back to env.
 */
async function resolveApiKey() {
  return await getEncryptedSetting('vapi_api_key') || env.vapi.apiKey;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initiate an outbound phone call via Vapi.
 *
 * @param {Object} options
 * @param {string} options.phoneNumber    - E.164 phone number to call (e.g. '+12025551234')
 * @param {string} options.assistantId    - Vapi assistant ID (defaults to DB setting, then env var)
 * @param {string} options.phoneNumberId  - Vapi phone number ID (defaults to DB setting, then env var)
 * @param {Object} options.assistantOverrides - Optional runtime overrides for assistant config
 * @param {Object} options.metadata       - Arbitrary metadata attached to the call (lead info, etc.)
 * @returns {Promise<Object>} Vapi call object (contains call.id, call.status, etc.)
 */
async function initiateCall({
  phoneNumber,
  assistantId,
  phoneNumberId,
  assistantOverrides,
  metadata = {},
}) {
  const apiKey = await resolveApiKey();
  const resolvedAssistantId = assistantId
    || await getEncryptedSetting('vapi_assistant_id')
    || env.vapi.assistantId;
  const resolvedPhoneNumberId = phoneNumberId
    || await getEncryptedSetting('vapi_phone_number_id')
    || env.vapi.phoneNumberId;

  if (!resolvedAssistantId) {
    throw new Error(
      'No Vapi assistant ID provided. Set VAPI_ASSISTANT_ID in .env or configure one in Integrations > API Keys.'
    );
  }

  if (!resolvedPhoneNumberId) {
    throw new Error(
      'No Vapi phone number ID provided. Set VAPI_PHONE_NUMBER_ID in .env or configure one in Integrations > API Keys.'
    );
  }

  if (!phoneNumber) {
    throw new Error('phoneNumber is required to initiate a call.');
  }

  const body = {
    assistantId: resolvedAssistantId,
    phoneNumberId: resolvedPhoneNumberId,
    customer: {
      number: phoneNumber,
    },
    ...(assistantOverrides ? { assistantOverrides } : {}),
    metadata,
  };

  logger.info('Initiating Vapi call', { phoneNumber, assistantId: resolvedAssistantId });

  const call = await vapiRequest('POST', '/call', body, apiKey);

  logger.info('Vapi call initiated', { vapiCallId: call.id, status: call.status });

  return call;
}

/**
 * Fetch the current status/details of a Vapi call.
 *
 * @param {string} vapiCallId - The Vapi call ID
 * @returns {Promise<Object>} Vapi call object
 */
async function getCallStatus(vapiCallId) {
  if (!vapiCallId) throw new Error('vapiCallId is required.');
  const apiKey = await resolveApiKey();
  return vapiRequest('GET', `/call/${vapiCallId}`, null, apiKey);
}

/**
 * List recent calls from Vapi (for sync/reconciliation).
 *
 * @param {Object} [options]
 * @param {number} [options.limit=50]
 * @returns {Promise<Object[]>}
 */
async function listCalls({ limit = 50 } = {}) {
  const apiKey = await resolveApiKey();
  return vapiRequest('GET', `/call?limit=${limit}`, null, apiKey);
}

/**
 * Verify the HMAC-SHA256 signature on a Vapi webhook payload.
 *
 * Vapi sends the signature in the `x-vapi-secret` header.
 * If no webhook secret is configured, verification is skipped (returns true)
 * so the server still works during initial setup.
 *
 * @param {string} rawBody         - Raw request body string
 * @param {string} signatureHeader - Value of the `x-vapi-secret` header
 * @param {string} [secret]        - Webhook secret (resolved by caller from DB/env)
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret) {
    // Webhook secret not configured — skip verification (log a warning)
    logger.warn('VAPI_WEBHOOK_SECRET is not set; skipping webhook signature verification.');
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signatureHeader, 'hex')
  );
}

/**
 * Build assistant override variables from a lead record.
 * Reads custom call script templates and knowledge base from the database.
 *
 * @param {Object} lead - Lead record from PostgreSQL
 * @returns {Promise<Object>} assistantOverrides
 */
async function buildAssistantOverrides(lead) {
  const customFirstMessage = await getSetting('vapi_custom_first_message', null);
  const customSystemPrompt = await getSetting('vapi_system_prompt', null);
  const knowledgeEnabled = await getSetting('vapi_knowledge_enabled', 'true');

  // --- Resolve first message ---
  let firstMessage;
  if (customFirstMessage && customFirstMessage.trim()) {
    firstMessage = customFirstMessage
      .replace(/\{\{leadName\}\}/g, lead.full_name || 'there')
      .replace(/\{\{projectDetails\}\}/g, lead.project_details ? lead.project_details.slice(0, 120) : 'your inquiry')
      .replace(/\{\{industry\}\}/g, lead.industry || 'your field')
      .replace(/\{\{email\}\}/g, lead.email || '')
      .replace(/\{\{phone\}\}/g, lead.phone || '');
  } else {
    // Fall back to original hardcoded message
    firstMessage = [
      `Hi, may I speak with ${lead.full_name || 'you'}?`,
      `I'm calling from our team regarding your inquiry.`,
      lead.project_details
        ? `I understand you were looking for help with: ${lead.project_details.slice(0, 120)}.`
        : '',
      `I'd love to set up a quick call to discuss how we can help. Is now a good time?`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  const overrides = {
    firstMessage,
    variableValues: {
      leadName: lead.full_name || 'there',
      leadEmail: lead.email || '',
      leadIndustry: lead.industry || '',
      leadProjectDetails: lead.project_details ? lead.project_details.slice(0, 300) : '',
    },
  };

  // --- Build system prompt with optional knowledge base ---
  if (customSystemPrompt && customSystemPrompt.trim()) {
    let systemPromptContent = customSystemPrompt;

    if (knowledgeEnabled === 'true' || knowledgeEnabled === true) {
      try {
        const knowledgeResult = await db.query(
          `SELECT title, content FROM vapi_knowledge_entries
           WHERE is_active = true
           ORDER BY sort_order ASC, created_at ASC`
        );
        if (knowledgeResult.rows.length > 0) {
          const knowledgeBlock = knowledgeResult.rows
            .map((e) => `**${e.title}**\n${e.content}`)
            .join('\n\n');
          systemPromptContent += `\n\n--- KNOWLEDGE BASE ---\n${knowledgeBlock}`;
        }
      } catch (err) {
        logger.warn('Failed to load knowledge base entries for call', { error: err.message });
      }
    }

    overrides.model = {
      messages: [{ role: 'system', content: systemPromptContent }],
    };
  }

  return overrides;
}

module.exports = {
  initiateCall,
  getCallStatus,
  listCalls,
  verifyWebhookSignature,
  buildAssistantOverrides,
};
