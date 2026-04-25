const { generateCompletion } = require('./aiProvider');
const db = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Generates a personalized cold email (or follow-up) for a lead using the
 * Claude API.  Returns { subject, bodyHtml, bodyText }.
 *
 * @param {Object}  params
 * @param {Object}  params.lead             - Lead record (id, full_name, email, industry, lead_type, project_details)
 * @param {Object}  params.brand            - Brand record (ai_system_prompt, booking_link, ai_model, name, primary_domain)
 * @param {string}  params.campaignName     - Campaign name for context
 * @param {number}  [params.followupNumber] - 0 = initial email, 1+ = follow-up sequence number
 * @param {string}  [params.previousSubject]- Subject of the previous email (for follow-ups)
 * @returns {Promise<{ subject: string, bodyHtml: string, bodyText: string }>}
 */
async function generateEmail({ lead, brand, campaignName, followupNumber = 0, previousSubject = '' }) {
  if (!lead || !lead.id || !lead.email) {
    throw new Error('generateEmail requires a lead with at least id and email');
  }
  if (!brand || !brand.ai_system_prompt) {
    throw new Error('generateEmail requires a brand with ai_system_prompt');
  }

  const unsubscribeUrl = `${env.backendUrl}/api/leads/unsubscribe/${lead.id}`;

  // ── System prompt ──────────────────────────────────────────────────
  const systemPrompt = [
    brand.ai_system_prompt,
    '',
    'You are an expert cold-email copywriter. Your emails are concise, personal,',
    'and action-oriented. You avoid spammy language, use the recipient\'s name,',
    'and always close with a single clear call-to-action.',
    '',
    'IMPORTANT RULES:',
    '- Never use all-caps words (except proper nouns/acronyms).',
    '- Never use more than one exclamation mark in the entire email.',
    '- Keep the subject line under 60 characters and make it feel personal.',
    '- The HTML body should use simple inline styles only. No external CSS.',
    '- Always include a plain-text version alongside the HTML version.',
    '- The call-to-action must link to the booking link provided.',
    '- Always include the unsubscribe link at the bottom of the email.',
    '',
    'OUTPUT FORMAT:',
    'You must respond with ONLY a valid JSON object (no markdown fences, no extra text):',
    '{ "subject": "...", "bodyHtml": "...", "bodyText": "..." }',
  ].join('\n');

  // ── User prompt ────────────────────────────────────────────────────
  const userPromptParts = [
    `Generate a cold outreach email for the following lead.`,
    '',
    `Recipient name: ${lead.full_name || 'there'}`,
    `Recipient email: ${lead.email}`,
  ];

  if (lead.industry) {
    userPromptParts.push(`Industry: ${lead.industry}`);
  }
  if (lead.lead_type) {
    userPromptParts.push(`Lead type: ${lead.lead_type}`);
  }
  if (lead.project_details) {
    userPromptParts.push(`Project details / notes: ${lead.project_details}`);
  }

  userPromptParts.push('');
  userPromptParts.push(`Brand name: ${brand.name || ''}`);
  userPromptParts.push(`Campaign: ${campaignName || 'Outreach'}`);

  if (brand.booking_link) {
    userPromptParts.push(`Booking link (use as the CTA): ${brand.booking_link}`);
  }

  userPromptParts.push(`Unsubscribe URL (place at bottom): ${unsubscribeUrl}`);

  // Follow-up specific instructions
  if (followupNumber > 0) {
    userPromptParts.push('');
    userPromptParts.push(`This is follow-up #${followupNumber}.`);
    if (previousSubject) {
      userPromptParts.push(`The previous email had the subject: "${previousSubject}"`);
    }
    userPromptParts.push(
      'Write a concise follow-up that references your previous email without ' +
      'repeating it. Be shorter than the original, add new value, and include ' +
      'a gentle reminder of the CTA. Do NOT re-introduce yourself at length.'
    );
  }

  const userPrompt = userPromptParts.join('\n');

  // ── API call ───────────────────────────────────────────────────────
  const model = brand.ai_model || 'claude-haiku-3-5';

  logger.debug('Generating email with Claude', {
    model,
    leadId: lead.id,
    followupNumber,
  });

  let aiResult;
  try {
    aiResult = await generateCompletion({ model, systemPrompt, userPrompt, maxTokens: 1500 });
  } catch (apiErr) {
    logger.error('AI API call failed', {
      error: apiErr.message,
      leadId: lead.id,
      model,
    });
    throw new Error(`AI API error: ${apiErr.message}`);
  }

  // ── Parse response ─────────────────────────────────────────────────
  const rawText = aiResult.text || '';

  let parsed;
  try {
    // The model sometimes wraps its JSON in markdown fences; strip them.
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    logger.error('Failed to parse Claude email response as JSON', {
      rawText: rawText.substring(0, 500),
      error: parseErr.message,
      leadId: lead.id,
    });
    throw new Error('Claude returned an invalid JSON response for email generation');
  }

  if (!parsed.subject || !parsed.bodyHtml || !parsed.bodyText) {
    logger.error('Claude response missing required email fields', {
      keys: Object.keys(parsed),
      leadId: lead.id,
    });
    throw new Error('Claude response missing one or more required fields (subject, bodyHtml, bodyText)');
  }

  // Truncate subject to 60 chars as a safety net
  const subject = parsed.subject.length > 60
    ? parsed.subject.substring(0, 57) + '...'
    : parsed.subject;

  logger.debug('Email generated successfully', {
    leadId: lead.id,
    subjectLength: subject.length,
    followupNumber,
  });

  return {
    subject,
    bodyHtml: parsed.bodyHtml,
    bodyText: parsed.bodyText,
  };
}

/**
 * Generates multiple subject-line variants for A/B testing.
 *
 * @param {Object}   params
 * @param {Object}   params.brand      - Brand record (ai_system_prompt, ai_model, name)
 * @param {Object}   params.leadSample - A representative lead to ground the context
 * @param {number}   [params.count]    - Number of variants to generate (default: 4)
 * @returns {Promise<string[]>}        - Array of subject line strings
 */
async function generateSubjectVariants({ brand, leadSample, count = 4 }) {
  if (!brand || !brand.ai_system_prompt) {
    throw new Error('generateSubjectVariants requires a brand with ai_system_prompt');
  }
  if (!leadSample) {
    throw new Error('generateSubjectVariants requires a leadSample');
  }

  // Clamp count to a sensible range
  const safeCount = Math.max(2, Math.min(count, 10));

  const systemPrompt = [
    brand.ai_system_prompt,
    '',
    'You are an expert cold-email copywriter focused on writing subject lines.',
    'Subject lines must be under 60 characters, feel personal, avoid spammy',
    'language, and never use all-caps (except proper nouns/acronyms).',
    '',
    'OUTPUT FORMAT:',
    'Respond with ONLY a valid JSON array of strings (no markdown fences, no extra text).',
    'Example: ["Subject A", "Subject B", "Subject C"]',
  ].join('\n');

  const userPromptParts = [
    `Generate exactly ${safeCount} distinct email subject line variants for A/B testing.`,
    '',
    `Brand: ${brand.name || 'Our company'}`,
  ];

  if (leadSample.industry) {
    userPromptParts.push(`Target industry: ${leadSample.industry}`);
  }
  if (leadSample.lead_type) {
    userPromptParts.push(`Lead type: ${leadSample.lead_type}`);
  }
  if (leadSample.full_name) {
    userPromptParts.push(`Example recipient name: ${leadSample.full_name}`);
  }
  if (leadSample.project_details) {
    userPromptParts.push(`Context / project details: ${leadSample.project_details}`);
  }

  userPromptParts.push('');
  userPromptParts.push(
    'Make each variant stylistically different (e.g. question, personalized, ' +
    'curiosity gap, direct benefit, social proof). Each must be under 60 characters.'
  );

  const userPrompt = userPromptParts.join('\n');
  const model = brand.ai_model || 'claude-haiku-3-5';

  logger.debug('Generating subject variants with Claude', { model, count: safeCount });

  let aiResult;
  try {
    aiResult = await generateCompletion({ model, systemPrompt, userPrompt, maxTokens: 800 });
  } catch (apiErr) {
    logger.error('AI API call failed for subject variants', {
      error: apiErr.message,
      model,
    });
    throw new Error(`AI API error: ${apiErr.message}`);
  }

  const rawText = aiResult.text || '';

  let variants;
  try {
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    variants = JSON.parse(cleaned);
  } catch (parseErr) {
    logger.error('Failed to parse Claude subject variants response', {
      rawText: rawText.substring(0, 500),
      error: parseErr.message,
    });
    throw new Error('Claude returned invalid JSON for subject variants');
  }

  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('Claude returned an empty or non-array response for subject variants');
  }

  // Enforce 60-char limit on each variant
  const trimmed = variants
    .filter((v) => typeof v === 'string' && v.trim().length > 0)
    .map((v) => (v.length > 60 ? v.substring(0, 57) + '...' : v));

  if (trimmed.length === 0) {
    throw new Error('All subject variants from Claude were empty or invalid');
  }

  logger.debug('Subject variants generated', { count: trimmed.length });

  return trimmed;
}

module.exports = {
  generateEmail,
  generateSubjectVariants,
};
