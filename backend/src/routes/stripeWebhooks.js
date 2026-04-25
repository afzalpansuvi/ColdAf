/**
 * Stripe webhook handler.
 *
 * MUST be mounted with express.raw({ type: 'application/json' }) BEFORE the
 * global express.json() middleware, because signature verification hashes the
 * raw request body.
 */
const express = require('express');
const db = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');
const { getStripe, isConfigured } = require('../services/stripe');
const { PLANS } = require('./billing');

const router = express.Router();

// Map a Stripe price id back to our internal plan key
function planKeyFromPriceId(priceId) {
  for (const [key, pid] of Object.entries(env.stripe.prices)) {
    if (pid && pid === priceId) return key;
  }
  return null;
}

async function markEventProcessed(event, organizationId) {
  try {
    await db.query(
      `INSERT INTO stripe_events (id, type, payload, organization_id)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.type, JSON.stringify(event), organizationId || null]
    );
  } catch (err) {
    logger.warn('Could not record stripe_event', { error: err.message, eventId: event.id });
  }
}

async function alreadyProcessed(eventId) {
  const r = await db.query('SELECT 1 FROM stripe_events WHERE id = $1 LIMIT 1', [eventId]);
  return r.rows.length > 0;
}

/**
 * Apply a Stripe subscription state change to our organizations row.
 */
async function applySubscriptionState(subscription) {
  const customerId = subscription.customer;
  const orgRes = await db.query(
    'SELECT id FROM organizations WHERE stripe_customer_id = $1 LIMIT 1',
    [customerId]
  );
  if (orgRes.rows.length === 0) {
    logger.warn('Stripe subscription for unknown customer', { customerId });
    return null;
  }
  const organizationId = orgRes.rows[0].id;

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const planKey = planKeyFromPriceId(priceId);
  const planDef = planKey ? PLANS[planKey] : null;

  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  // Base update — always record Stripe state
  const updates = [
    `stripe_subscription_id = $1`,
    `stripe_price_id = $2`,
    `stripe_status = $3`,
    `stripe_current_period_end = $4`,
    `stripe_cancel_at_period_end = $5`,
    `updated_at = NOW()`,
  ];
  const params = [
    subscription.id,
    priceId || null,
    subscription.status,
    currentPeriodEnd,
    subscription.cancel_at_period_end || false,
  ];

  // If subscription is active AND we recognise the plan, update plan + limits
  if (['active', 'trialing'].includes(subscription.status) && planKey && planDef) {
    updates.push(`plan = $${params.length + 1}`);
    params.push(planKey);
    updates.push(`plan_started_at = COALESCE(plan_started_at, NOW())`);
    updates.push(`trial_ends_at = NULL`);
    updates.push(`max_users = $${params.length + 1}`);
    params.push(planDef.maxUsers);
    updates.push(`max_brands = $${params.length + 1}`);
    params.push(planDef.maxBrands);
    updates.push(`max_emails_per_month = $${params.length + 1}`);
    params.push(planDef.maxEmailsPerMonth);
    updates.push(`max_phone_minutes_per_month = $${params.length + 1}`);
    params.push(planDef.maxPhoneMinutesPerMonth);
  }

  params.push(organizationId);

  await db.query(
    `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${params.length}`,
    params
  );

  logger.info('Applied Stripe subscription state', {
    organizationId,
    status: subscription.status,
    plan: planKey,
  });

  return organizationId;
}

/**
 * Handle subscription cancellation — drop the org back to Free tier.
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;
  const orgRes = await db.query(
    'SELECT id FROM organizations WHERE stripe_customer_id = $1 LIMIT 1',
    [customerId]
  );
  if (orgRes.rows.length === 0) return null;
  const organizationId = orgRes.rows[0].id;

  const freeDef = PLANS.free;
  await db.query(
    `UPDATE organizations
        SET plan = 'free',
            stripe_status = 'canceled',
            stripe_subscription_id = NULL,
            stripe_price_id = NULL,
            max_users = $1,
            max_brands = $2,
            max_emails_per_month = $3,
            max_phone_minutes_per_month = $4,
            updated_at = NOW()
      WHERE id = $5`,
    [freeDef.maxUsers, freeDef.maxBrands, freeDef.maxEmailsPerMonth, freeDef.maxPhoneMinutesPerMonth, organizationId]
  );

  logger.info('Subscription cancelled → downgraded to Free', { organizationId });
  return organizationId;
}

// ---------------------------------------------------------------------------
// POST /webhooks/stripe
// ---------------------------------------------------------------------------
router.post('/stripe', async (req, res) => {
  if (!isConfigured()) {
    return res.status(503).send('Stripe not configured');
  }

  const stripe = getStripe();
  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.stripe.webhookSecret);
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', { error: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotency
  try {
    if (await alreadyProcessed(event.id)) {
      return res.json({ received: true, deduplicated: true });
    }
  } catch (e) {
    // if stripe_events table is missing, log and keep going (best-effort)
    logger.warn('Idempotency check failed', { error: e.message });
  }

  let organizationId = null;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // Pull the subscription and apply its state
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          organizationId = await applySubscriptionState(subscription);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        organizationId = await applySubscriptionState(event.data.object);
        break;
      }
      case 'customer.subscription.deleted': {
        organizationId = await handleSubscriptionDeleted(event.data.object);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const r = await db.query(
          'SELECT id FROM organizations WHERE stripe_customer_id = $1 LIMIT 1',
          [invoice.customer]
        );
        if (r.rows.length > 0) {
          organizationId = r.rows[0].id;
          await db.query(
            `UPDATE organizations SET stripe_status = 'past_due', updated_at = NOW() WHERE id = $1`,
            [organizationId]
          );
          logger.warn('Invoice payment failed', { organizationId, invoiceId: invoice.id });
        }
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const r = await db.query(
          'SELECT id FROM organizations WHERE stripe_customer_id = $1 LIMIT 1',
          [invoice.customer]
        );
        if (r.rows.length > 0) {
          organizationId = r.rows[0].id;
          await db.query(
            `UPDATE organizations SET stripe_status = 'active', updated_at = NOW()
              WHERE id = $1 AND stripe_status IN ('past_due', 'unpaid')`,
            [organizationId]
          );
        }
        break;
      }
      default:
        logger.debug('Unhandled Stripe event', { type: event.type });
    }

    await markEventProcessed(event, organizationId);
    return res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook handler error', { error: err.message, eventType: event.type });
    return res.status(500).send('Handler error');
  }
});

module.exports = router;
