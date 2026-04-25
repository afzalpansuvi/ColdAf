const logger = require('../utils/logger');
const { getApiKey } = require('./apiKeys');

// ─── Unified AI Provider Interface ───────────────────────────────────────────
//
// Supports Anthropic Claude, OpenAI, and Google Gemini through a single
// function call. Provider can be explicitly specified or auto-detected from
// the model name.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-detects the AI provider from a model name string.
 *
 * @param {string} model - Model identifier (e.g. 'claude-3-haiku', 'gpt-4o', 'gemini-1.5-pro')
 * @returns {string|null} Provider key or null if unrecognised
 */
function detectProvider(model) {
  if (!model || typeof model !== 'string') return null;

  const lower = model.toLowerCase();

  if (lower.startsWith('claude')) return 'anthropic';
  if (lower.startsWith('gpt')) return 'openai';
  if (lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) return 'openai';
  if (lower.startsWith('gemini')) return 'google_gemini';

  return null;
}

/**
 * Generates a completion using the specified (or auto-detected) AI provider.
 *
 * Returns a normalised result object regardless of which provider was used,
 * including the response text and token usage where available.
 *
 * @param {Object}  params
 * @param {string}  [params.provider]       - 'anthropic' | 'openai' | 'google_gemini' (auto-detected from model if omitted)
 * @param {string}  params.model            - Model identifier (e.g. 'claude-3-haiku-20240307', 'gpt-4o', 'gemini-1.5-pro')
 * @param {string}  params.systemPrompt     - System-level instructions
 * @param {string}  params.userPrompt       - User message / prompt content
 * @param {number}  [params.maxTokens=1500] - Maximum tokens in the response
 * @param {string}  [params.organizationId] - Org UUID for org-scoped BYOK API key lookup
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, provider: string, model: string }>}
 */
async function generateCompletion({ provider, model, systemPrompt, userPrompt, maxTokens = 1500, organizationId }) {
  if (!model) {
    throw new Error('generateCompletion requires a model parameter');
  }
  if (!userPrompt) {
    throw new Error('generateCompletion requires a userPrompt parameter');
  }

  // Resolve provider
  const resolvedProvider = provider || detectProvider(model);
  if (!resolvedProvider) {
    throw new Error(
      `Unable to determine AI provider for model "${model}". ` +
      'Pass an explicit provider parameter (anthropic, openai, or google_gemini).'
    );
  }

  logger.debug('AI completion requested', {
    provider: resolvedProvider,
    model,
    maxTokens,
    organizationId: organizationId || 'platform',
    systemPromptLength: systemPrompt ? systemPrompt.length : 0,
    userPromptLength: userPrompt.length,
  });

  switch (resolvedProvider) {
    case 'anthropic':
      return callAnthropic({ model, systemPrompt, userPrompt, maxTokens, organizationId });
    case 'openai':
      return callOpenAI({ model, systemPrompt, userPrompt, maxTokens, organizationId });
    case 'google_gemini':
      return callGoogleGemini({ model, systemPrompt, userPrompt, maxTokens, organizationId });
    default:
      throw new Error(`Unsupported AI provider: "${resolvedProvider}"`);
  }
}

// ─── Anthropic Claude ────────────────────────────────────────────────────────

/**
 * Calls the Anthropic Messages API using @anthropic-ai/sdk.
 *
 * @param {Object} params
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, provider: string, model: string }>}
 */
async function callAnthropic({ model, systemPrompt, userPrompt, maxTokens, organizationId }) {
  const apiKey = await getApiKey('anthropic', organizationId);
  if (!apiKey) {
    throw new Error(
      'Anthropic API key not configured. Set it in Organization Settings → AI Keys or via the ANTHROPIC_API_KEY environment variable.'
    );
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const startTime = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt || undefined,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const duration = Date.now() - startTime;
  const text = (response.content && response.content[0] && response.content[0].text) || '';
  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;

  logger.debug('Anthropic completion finished', {
    model,
    inputTokens,
    outputTokens,
    durationMs: duration,
  });

  return { text, inputTokens, outputTokens, provider: 'anthropic', model };
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

/**
 * Calls the OpenAI Chat Completions API using the openai package.
 *
 * @param {Object} params
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, provider: string, model: string }>}
 */
async function callOpenAI({ model, systemPrompt, userPrompt, maxTokens, organizationId }) {
  const apiKey = await getApiKey('openai', organizationId);
  if (!apiKey) {
    throw new Error(
      'OpenAI API key not configured. Set it in Organization Settings → AI Keys or via the OPENAI_API_KEY environment variable.'
    );
  }

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey });

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const startTime = Date.now();

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
  });

  const duration = Date.now() - startTime;
  const choice = response.choices && response.choices[0];
  const text = (choice && choice.message && choice.message.content) || '';
  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;

  logger.debug('OpenAI completion finished', {
    model,
    inputTokens,
    outputTokens,
    durationMs: duration,
  });

  return { text, inputTokens, outputTokens, provider: 'openai', model };
}

// ─── Google Gemini ───────────────────────────────────────────────────────────

/**
 * Calls the Google Generative AI (Gemini) API using @google/generative-ai.
 *
 * @param {Object} params
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, provider: string, model: string }>}
 */
async function callGoogleGemini({ model, systemPrompt, userPrompt, maxTokens, organizationId }) {
  const apiKey = await getApiKey('google_gemini', organizationId);
  if (!apiKey) {
    throw new Error(
      'Google Gemini API key not configured. Set it in Organization Settings → AI Keys or via the GOOGLE_GEMINI_API_KEY environment variable.'
    );
  }

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  const generationConfig = {
    maxOutputTokens: maxTokens,
  };

  const modelConfig = {
    model,
    generationConfig,
  };

  // Apply system instruction if provided
  if (systemPrompt) {
    modelConfig.systemInstruction = systemPrompt;
  }

  const geminiModel = genAI.getGenerativeModel(modelConfig);

  const startTime = Date.now();

  const result = await geminiModel.generateContent(userPrompt);
  const response = result.response;

  const duration = Date.now() - startTime;
  const text = response.text() || '';

  // Gemini provides usage metadata when available
  const usageMetadata = response.usageMetadata || {};
  const inputTokens = usageMetadata.promptTokenCount || 0;
  const outputTokens = usageMetadata.candidatesTokenCount || 0;

  logger.debug('Google Gemini completion finished', {
    model,
    inputTokens,
    outputTokens,
    durationMs: duration,
  });

  return { text, inputTokens, outputTokens, provider: 'google_gemini', model };
}

module.exports = { generateCompletion, detectProvider };
