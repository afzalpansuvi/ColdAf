/**
 * sequenceProcessor.js
 *
 * Handles conditional sequence branching for campaigns where use_sequences = true.
 * Called by schedulerWorker on each campaign-processor tick.
 *
 * Schema reference (002_enhancements.sql):
 *   sequence_steps: id, campaign_id, parent_step_id, step_order, step_type,
 *                   condition_type, condition_value, delay_days, delay_hours,
 *                   template_id, subject_override, branch_label, is_active
 *   lead_sequence_state: id, campaign_id, lead_id, current_step_id,
 *                        step_completed_at, next_action_at, status
 */

const db = require('../config/database');
const logger = require('../utils/logger');
const { generateEmail } = require('../services/emailGenerator');

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/**
 * Checks whether a lead has opened any email in this campaign since a reference date.
 */
async function hasOpened(campaignId, leadId, sinceAt) {
  const result = await db.query(
    `SELECT 1 FROM emails_sent
     WHERE campaign_id = $1 AND lead_id = $2 AND opened_at IS NOT NULL
       AND ($3::timestamptz IS NULL OR opened_at >= $3)
     LIMIT 1`,
    [campaignId, leadId, sinceAt || null]
  );
  return result.rows.length > 0;
}

/**
 * Checks whether a lead has clicked any link in this campaign since a reference date.
 */
async function hasClicked(campaignId, leadId, sinceAt) {
  const result = await db.query(
    `SELECT 1 FROM emails_sent
     WHERE campaign_id = $1 AND lead_id = $2 AND clicked_at IS NOT NULL
       AND ($3::timestamptz IS NULL OR clicked_at >= $3)
     LIMIT 1`,
    [campaignId, leadId, sinceAt || null]
  );
  return result.rows.length > 0;
}

/**
 * Checks whether a lead has replied in this campaign since a reference date.
 */
async function hasReplied(campaignId, leadId, sinceAt) {
  const result = await db.query(
    `SELECT 1 FROM reply_messages
     WHERE campaign_id = $1 AND lead_id = $2
       AND ($3::timestamptz IS NULL OR received_at >= $3)
     LIMIT 1`,
    [campaignId, leadId, sinceAt || null]
  );
  return result.rows.length > 0;
}

/**
 * Evaluates whether the lead satisfies a step's condition_type.
 * Returns true when the condition is met, false otherwise.
 *
 * Condition types from migration:
 *   'start'       — always true (first step)
 *   'opened'      — lead opened at least one email
 *   'not_opened'  — lead has not opened any email
 *   'clicked'     — lead clicked at least one link
 *   'not_clicked' — lead has not clicked
 *   'replied'     — lead replied
 *   'not_replied' — lead has not replied
 *   'no_action'   — lead has neither opened nor replied (= not_opened AND not_replied)
 */
async function evaluateCondition(conditionType, campaignId, leadId, sinceAt) {
  switch (conditionType) {
    case 'start':
      return true;

    case 'opened':
      return hasOpened(campaignId, leadId, sinceAt);

    case 'not_opened':
      return !(await hasOpened(campaignId, leadId, sinceAt));

    case 'clicked':
      return hasClicked(campaignId, leadId, sinceAt);

    case 'not_clicked':
      return !(await hasClicked(campaignId, leadId, sinceAt));

    case 'replied':
      return hasReplied(campaignId, leadId, sinceAt);

    case 'not_replied':
      return !(await hasReplied(campaignId, leadId, sinceAt));

    case 'no_action': {
      const [opened, replied] = await Promise.all([
        hasOpened(campaignId, leadId, sinceAt),
        hasReplied(campaignId, leadId, sinceAt),
      ]);
      return !opened && !replied;
    }

    default:
      // Unknown condition: default to true so the sequence doesn't stall
      logger.warn('Unknown condition_type in sequence step, defaulting to true', { conditionType });
      return true;
  }
}

// ---------------------------------------------------------------------------
// SMTP account picker (mirrors pattern in schedulerWorker)
// ---------------------------------------------------------------------------

async function pickSmtpAccount(brandId) {
  const result = await db.query(
    `SELECT id, email_address, display_name, daily_send_limit, sends_today
     FROM smtp_accounts
     WHERE brand_id = $1
       AND is_active = TRUE
       AND health_status != 'failed'
       AND sends_today < daily_send_limit
     ORDER BY sends_today ASC
     LIMIT 1`,
    [brandId]
  );
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Queue an email for a sequence step
// ---------------------------------------------------------------------------

async function queueStepEmail(step, lead, campaign, brandId) {
  const smtpAccount = await pickSmtpAccount(brandId);
  if (!smtpAccount) {
    logger.warn('No SMTP capacity for sequence step email', {
      campaignId: campaign.id,
      leadId: lead.id,
      stepId: step.id,
    });
    return false;
  }

  let subject = step.subject_override || null;
  let bodyHtml = null;
  let bodyText = null;

  // If a template is linked, resolve it
  if (step.template_id) {
    const tplResult = await db.query(
      `SELECT subject, body_html, body_text FROM email_templates WHERE id = $1`,
      [step.template_id]
    );
    if (tplResult.rows.length > 0) {
      const tpl = tplResult.rows[0];
      subject = subject || tpl.subject;
      bodyHtml = tpl.body_html;
      bodyText = tpl.body_text;
    }
  }

  // Fall back to AI generation if no template body
  if (!bodyHtml) {
    const brandResult = await db.query(
      `SELECT * FROM brands WHERE id = $1 AND is_active = TRUE`,
      [brandId]
    );
    if (brandResult.rows.length > 0) {
      const generated = await generateEmail({
        lead: {
          id: lead.id,
          full_name: lead.full_name,
          email: lead.email,
          industry: lead.industry,
          lead_type: lead.lead_type,
          project_details: lead.project_details,
        },
        brand: brandResult.rows[0],
        campaignName: campaign.name,
        followupNumber: step.step_order || 1,
      });
      subject = subject || generated.subject;
      bodyHtml = generated.bodyHtml;
      bodyText = generated.bodyText;
    }
  }

  if (!subject) subject = `Follow-up from ${campaign.name}`;

  // Get campaign_lead id
  const clResult = await db.query(
    `SELECT id FROM campaign_leads WHERE campaign_id = $1 AND lead_id = $2 LIMIT 1`,
    [campaign.id, lead.id]
  );
  const campaignLeadId = clResult.rows.length > 0 ? clResult.rows[0].id : null;

  await db.query(
    `INSERT INTO emails_sent
      (campaign_id, campaign_lead_id, lead_id, brand_id, smtp_account_id,
       from_email, from_name, to_email, subject, body_html, body_text,
       followup_number, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'queued')`,
    [
      campaign.id,
      campaignLeadId,
      lead.id,
      brandId,
      smtpAccount.id,
      smtpAccount.email_address,
      smtpAccount.display_name || smtpAccount.email_address,
      lead.email,
      subject,
      bodyHtml || '',
      bodyText || '',
      step.step_order || 1,
    ]
  );

  logger.debug('Queued sequence step email', {
    campaignId: campaign.id,
    leadId: lead.id,
    stepId: step.id,
    stepOrder: step.step_order,
  });

  return true;
}

// ---------------------------------------------------------------------------
// Find the next step to transition to
// ---------------------------------------------------------------------------

/**
 * Finds the next step for a lead after the current step, respecting branch logic.
 *
 * Strategy:
 *  1. If the current step is a 'condition' type, evaluate the condition and
 *     pick the child with branch_label = 'yes' (met) or 'no' (not met).
 *  2. Otherwise, pick the next child step by step_order (i.e. children of current step).
 *  3. Fall back to the next sibling at the same level (same parent_step_id).
 */
async function findNextStep(currentStep, campaignId, conditionMet) {
  // Try direct children first (branching)
  const childrenResult = await db.query(
    `SELECT * FROM sequence_steps
     WHERE campaign_id = $1 AND parent_step_id = $2 AND is_active = TRUE
     ORDER BY step_order ASC`,
    [campaignId, currentStep.id]
  );

  if (childrenResult.rows.length > 0) {
    if (currentStep.step_type === 'condition') {
      // Pick yes/no branch
      const wantLabel = conditionMet ? 'yes' : 'no';
      const branch = childrenResult.rows.find((s) => s.branch_label === wantLabel);
      if (branch) return branch;
      // If no explicit branch label, just take the first child
      return childrenResult.rows[0];
    }
    // Non-condition: take first child
    return childrenResult.rows[0];
  }

  // No children: try next sibling (same parent, higher step_order)
  const siblingResult = await db.query(
    `SELECT * FROM sequence_steps
     WHERE campaign_id = $1
       AND (parent_step_id = $2 OR ($2 IS NULL AND parent_step_id IS NULL))
       AND step_order > $3
       AND is_active = TRUE
     ORDER BY step_order ASC
     LIMIT 1`,
    [campaignId, currentStep.parent_step_id, currentStep.step_order]
  );

  return siblingResult.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Process a single lead's sequence state
// ---------------------------------------------------------------------------

async function processLeadState(state, campaign, brandId) {
  const { id: stateId, lead_id: leadId, current_step_id: currentStepId, step_completed_at: stepCompletedAt } = state;

  // Fetch current step
  const stepResult = await db.query(
    `SELECT * FROM sequence_steps WHERE id = $1 AND is_active = TRUE`,
    [currentStepId]
  );

  if (stepResult.rows.length === 0) {
    // Step no longer exists — mark sequence as completed
    await db.query(
      `UPDATE lead_sequence_state SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [stateId]
    );
    return;
  }

  const currentStep = stepResult.rows[0];

  // Fetch lead data
  const leadResult = await db.query(
    `SELECT id, full_name, email, industry, lead_type, project_details, unsubscribed
     FROM leads WHERE id = $1`,
    [leadId]
  );

  if (leadResult.rows.length === 0 || leadResult.rows[0].unsubscribed) {
    await db.query(
      `UPDATE lead_sequence_state SET status = 'exited', updated_at = NOW() WHERE id = $1`,
      [stateId]
    );
    return;
  }

  const lead = leadResult.rows[0];

  // Evaluate condition
  const conditionMet = await evaluateCondition(
    currentStep.condition_type || 'no_action',
    campaign.id,
    leadId,
    stepCompletedAt
  );

  // For 'email' steps: send the email, then advance
  // For 'condition' steps: evaluate and branch, no email to send
  // For 'wait' steps: just advance when delay has passed

  if (currentStep.step_type === 'email') {
    await queueStepEmail(currentStep, lead, campaign, brandId);
  }

  // Find next step
  const nextStep = await findNextStep(currentStep, campaign.id, conditionMet);

  if (!nextStep) {
    // End of sequence
    await db.query(
      `UPDATE lead_sequence_state
       SET status = 'completed', step_completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [stateId]
    );
    logger.debug('Lead sequence completed', { campaignId: campaign.id, leadId, stateId });
    return;
  }

  // Calculate next_action_at based on next step's delay
  const delayMs =
    ((nextStep.delay_days || 0) * 24 * 60 * 60 +
      (nextStep.delay_hours || 0) * 60 * 60) *
    1000;

  const nextActionAt = new Date(Date.now() + delayMs);

  await db.query(
    `UPDATE lead_sequence_state
     SET current_step_id = $1,
         step_completed_at = NOW(),
         next_action_at = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [nextStep.id, nextActionAt, stateId]
  );

  logger.debug('Advanced lead sequence step', {
    campaignId: campaign.id,
    leadId,
    fromStep: currentStepId,
    toStep: nextStep.id,
    nextActionAt,
  });
}

// ---------------------------------------------------------------------------
// Main entry point: called by schedulerWorker
// ---------------------------------------------------------------------------

/**
 * Processes all active sequence campaigns.
 * For each campaign, finds lead_sequence_state rows due for processing
 * and advances each lead through the conditional step tree.
 */
async function processSequenceSteps() {
  try {
    // Fetch active sequence campaigns
    const campaignResult = await db.query(
      `SELECT c.id, c.name, c.organization_id,
              cb.brand_id,
              o.is_active AS org_active, o.plan, o.trial_ends_at,
              o.stripe_status, o.max_emails_per_month, o.emails_sent_this_month
       FROM campaigns c
       JOIN campaign_brands cb ON cb.campaign_id = c.id
       LEFT JOIN organizations o ON o.id = c.organization_id
       WHERE c.status = 'active'
         AND c.use_sequences = TRUE`
    );

    if (campaignResult.rows.length === 0) return;

    for (const campaign of campaignResult.rows) {
      try {
        // Org guards (mirrors schedulerWorker pattern)
        if (campaign.org_active === false) continue;
        if (campaign.plan === 'trial' && campaign.trial_ends_at && new Date(campaign.trial_ends_at) < new Date()) continue;
        if (['past_due', 'unpaid'].includes(campaign.stripe_status)) continue;
        if (campaign.max_emails_per_month < 999999 && campaign.emails_sent_this_month >= campaign.max_emails_per_month) continue;

        // Fetch due lead states
        const stateResult = await db.query(
          `SELECT * FROM lead_sequence_state
           WHERE campaign_id = $1
             AND status = 'active'
             AND next_action_at <= NOW()
           ORDER BY next_action_at ASC
           LIMIT 30`,
          [campaign.id]
        );

        if (stateResult.rows.length === 0) continue;

        logger.debug('Processing sequence campaign', {
          campaignId: campaign.id,
          dueStates: stateResult.rows.length,
        });

        for (const state of stateResult.rows) {
          try {
            await processLeadState(state, campaign, campaign.brand_id);
          } catch (stateErr) {
            logger.error('Error processing lead sequence state', {
              stateId: state.id,
              campaignId: campaign.id,
              leadId: state.lead_id,
              error: stateErr.message,
            });
          }
        }
      } catch (campaignErr) {
        logger.error('Error processing sequence campaign', {
          campaignId: campaign.id,
          error: campaignErr.message,
        });
      }
    }
  } catch (err) {
    logger.error('Fatal error in processSequenceSteps', { error: err.message });
  }
}

module.exports = { processSequenceSteps };
