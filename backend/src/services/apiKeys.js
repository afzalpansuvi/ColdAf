const db = require('../config/database');
const { decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

// In-memory cache with TTL (5 minutes)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Map of setting keys to env var names
const ENV_FALLBACKS = {
  anthropic_api_key: 'ANTHROPIC_API_KEY',
  openai_api_key: 'OPENAI_API_KEY',
  google_gemini_api_key: 'GOOGLE_GEMINI_API_KEY',
  sendgrid_api_key: 'SENDGRID_API_KEY',
  mailgun_api_key: 'MAILGUN_API_KEY',
  vapi_api_key: 'VAPI_API_KEY',
  vapi_phone_number_id: 'VAPI_PHONE_NUMBER_ID',
  vapi_assistant_id: 'VAPI_ASSISTANT_ID',
  vapi_webhook_secret: 'VAPI_WEBHOOK_SECRET',
};

// Map AI providers to their org-level column names in the organizations table
const ORG_AI_KEY_COLUMNS = {
  anthropic: 'anthropic_api_key_enc',
  openai: 'openai_api_key_enc',
  google_gemini: 'gemini_api_key_enc',
};

/**
 * Retrieves an API key, checking sources in this order:
 *   1. Organization-level key (if organizationId is provided and provider is AI)
 *   2. system_settings (platform-level)
 *   3. Environment variable
 *
 * @param {string}  provider        - Provider key (anthropic, openai, google_gemini, etc.)
 * @param {string}  [organizationId] - UUID of the requesting org (for org-scoped AI keys)
 * @returns {Promise<string|null>}
 */
async function getApiKey(provider, organizationId) {
  // provider is like 'anthropic', 'openai', 'google_gemini', 'sendgrid', 'mailgun'
  const settingKey = `${provider}_api_key`;

  // ── Step 1: Check org-level AI key (BYOK - Bring Your Own Key) ──────
  const orgColumn = ORG_AI_KEY_COLUMNS[provider];
  if (organizationId && orgColumn) {
    const orgCacheKey = `org:${organizationId}:${provider}`;
    const orgCached = cache.get(orgCacheKey);
    if (orgCached && Date.now() - orgCached.timestamp < CACHE_TTL) {
      return orgCached.value;
    }

    try {
      const orgResult = await db.query(
        `SELECT ${orgColumn} FROM organizations WHERE id = $1`,
        [organizationId]
      );
      if (orgResult.rows.length > 0) {
        const encValue = orgResult.rows[0][orgColumn];
        if (encValue && encValue.trim()) {
          let finalValue;
          try {
            finalValue = decrypt(encValue);
          } catch {
            finalValue = encValue; // Not encrypted, use as-is
          }
          cache.set(orgCacheKey, { value: finalValue, timestamp: Date.now() });
          return finalValue;
        }
      }
    } catch (err) {
      logger.warn(`Failed to read org AI key for "${provider}" from org ${organizationId}`, { error: err.message });
    }
  }

  // ── Step 2: Check system_settings (platform-level) ──────────────────
  const cached = cache.get(settingKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  try {
    const result = await db.query(
      'SELECT value FROM system_settings WHERE key = $1 LIMIT 1',
      [settingKey]
    );
    if (result.rows.length > 0) {
      let value = result.rows[0].value;
      // JSONB values may be quoted strings
      if (typeof value === 'string') {
        value = value.replace(/^"|"$/g, '');
      }
      if (value && value.trim() && value.trim() !== '') {
        // Try to decrypt if it looks encrypted, otherwise use raw
        let finalValue;
        try {
          finalValue = decrypt(value);
        } catch {
          finalValue = value; // Not encrypted, use as-is
        }
        cache.set(settingKey, { value: finalValue, timestamp: Date.now() });
        return finalValue;
      }
    }
  } catch (err) {
    logger.warn(`Failed to read API key "${settingKey}" from DB`, { error: err.message });
  }

  // ── Step 3: Fall back to environment variable ───────────────────────
  const envVar = ENV_FALLBACKS[settingKey];
  const envValue = envVar ? process.env[envVar] : null;
  if (envValue && envValue.trim()) {
    cache.set(settingKey, { value: envValue, timestamp: Date.now() });
    return envValue;
  }

  return null;
}

function clearCache(provider, organizationId) {
  if (provider && organizationId) {
    cache.delete(`org:${organizationId}:${provider}`);
    cache.delete(`${provider}_api_key`);
  } else if (provider) {
    cache.delete(`${provider}_api_key`);
  } else {
    cache.clear();
  }
}

// Get all configured providers (for UI display)
async function getConfiguredProviders() {
  const providers = {};
  for (const key of Object.keys(ENV_FALLBACKS)) {
    const provider = key.replace('_api_key', '');
    const apiKey = await getApiKey(provider);
    providers[provider] = {
      configured: !!apiKey,
      source: null, // don't expose which source
    };
  }
  return providers;
}

/**
 * Read any encrypted setting from system_settings by its full key name.
 * Same DB-first + env-fallback + cache logic as getApiKey, but accepts
 * arbitrary keys (e.g. 'vapi_phone_number_id') without appending '_api_key'.
 */
async function getEncryptedSetting(settingKey) {
  // Check cache
  const cached = cache.get(settingKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  // Check database
  try {
    const result = await db.query(
      'SELECT value FROM system_settings WHERE key = $1 LIMIT 1',
      [settingKey]
    );
    if (result.rows.length > 0) {
      let value = result.rows[0].value;
      if (typeof value === 'string') {
        value = value.replace(/^"|"$/g, '');
      }
      if (value && value.trim() && value.trim() !== '') {
        let finalValue;
        try {
          finalValue = decrypt(value);
        } catch {
          finalValue = value;
        }
        cache.set(settingKey, { value: finalValue, timestamp: Date.now() });
        return finalValue;
      }
    }
  } catch (err) {
    logger.warn(`Failed to read setting "${settingKey}" from DB`, { error: err.message });
  }

  // Fall back to environment variable
  const envVar = ENV_FALLBACKS[settingKey];
  const envValue = envVar ? process.env[envVar] : null;
  if (envValue && envValue.trim()) {
    cache.set(settingKey, { value: envValue, timestamp: Date.now() });
    return envValue;
  }

  return null;
}

module.exports = { getApiKey, getEncryptedSetting, clearCache, getConfiguredProviders };
