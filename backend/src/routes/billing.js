const express = require('express');
const db = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requirePermission } = require('../middleware/rbac');
const audit = require('../services/audit');
const { getStripe, isConfigured: stripeConfigured, ensureCustomer } = require('../services/stripe');

const router = express.Router();

router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// Plan definitions — source of truth for limits. Prices are in US cents.
// Free: lead-gen product-led growth.
// Trial: 14-day full-feature taste (Starter-tier limits).
// Paid tiers undercut every major competitor by 40–60% on entry.
// ---------------------------------------------------------------------------
const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    maxUsers: 1,
    maxBrands: 1,
    maxEmailsPerMonth: 250,
    maxPhoneMinutesPerMonth: 5,
    features: ['1 user', '1 brand', '250 emails/mo', '5 phone min/mo', 'BYOK AI (all models)'],
  },
  trial: {
    name: 'Trial',
    price: 0,
    maxUsers: 3,
    maxBrands: 1,
    maxEmailsPerMonth: 5000,
    maxPhoneMinutesPerMonth: 50,
    trialDays: 14,
    features: ['14-day full-feature trial', '3 users', '5,000 emails/mo', '50 phone min/mo', 'BYOK AI (all models)'],
  },
  solo: {
    name: 'Solo',
    price: 900, // $9
    maxUsers: 1,
    maxBrands: 1,
    maxEmailsPerMonth: 2000,
    maxPhoneMinutesPerMonth: 30,
    features: ['1 user', '1 brand', '2,000 emails/mo', '30 phone min/mo', 'BYOK AI (all models)'],
  },
  starter: {
    name: 'Starter',
    price: 2900, // $29
    maxUsers: 3,
    maxBrands: 2,
    maxEmailsPerMonth: 10000,
    maxPhoneMinutesPerMonth: 150,
    features: ['3 users', '2 brands', '10,000 emails/mo', '150 phone min/mo', 'BYOK AI (all models)', 'Deliverability toolkit'],
  },
  pro: {
    name: 'Pro',
    price: 5900, // $59
    maxUsers: 10,
    maxBrands: 5,
    maxEmailsPerMonth: 50000,
    maxPhoneMinutesPerMonth: 400,
    features: ['10 users', '5 brands', '50,000 emails/mo', '400 phone min/mo', 'BYOK AI', 'Public API', 'Priority support'],
  },
  scale: {
    name: 'Scale',
    price: 11900, // $119
    maxUsers: 25,
    maxBrands: 15,
    maxEmailsPerMonth: 200000,
    maxPhoneMinutesPerMonth: 1200,
    features: ['25 users', '15 brands', '200,000 emails/mo', '1,200 phone min/mo', 'BYOK AI', 'Saved views', 'Lead enrichment'],
  },
  agency: {
    name: 'Agency',
    price: 24900, // $249
    maxUsers: 50,
    maxBrands: 999999,
    maxEmailsPerMonth: 500000,
    maxPhoneMinutesPerMonth: 2500,
    features: ['50 users', 'Unlimited brands', '500,000 emails/mo', '2,500 phone min/mo', 'Whitelabel', 'Client portals', 'Custom domain'],
  },
  enterprise: {
    name: 'Enterprise',
    price: null, // custom
    maxUsers: 999999,
    maxBrands: 999999,
    maxEmailsPerMonth: 999999,
    maxPhoneMinutesPerMonth: 999999,
    features: ['Unlimited everything', 'SSO + SCIM', 'Dedicated IPs', 'SOC 2 reports', 'SLA + dedicated CSM'],
  },
};

// Plans that can be purchased through self-serve Stripe Checkout
const CHECKOUT_PLANS = ['solo', 'starter', 'pro', 'scale', 'agency'];

function priceDisplay(plan, key) {
  if (key === 'free') return 'Free forever';
  if (key === 'trial') return 'Free 14 days';
  if (key === 'enterprise') return 'Custom pricing';
  return `$${(plan.price / 100).toFixed(0)}/mo`;
}

// ---------------------------------------------------------------------------
// GET /plans — List available subscription plans
// ---------------------------------------------------------------------------
router.get('/plans', (req, res) => {
  const plans = Object.entries(PLANS).map(([key, plan]) => ({
    id: key,
    name: plan.name,
    price: plan.price,
    priceDisplay: priceDisplay(plan, key),
    purchasable: CHECKOUT_PLANS.includes(key),
    limits: {
      users: plan.maxUsers >= 999999 ? 'Unlimited' : plan.maxUsers,
      brands: plan.maxBrands >= 999999 ? 'Unlimited' : plan.maxBrands,
      emailsPerMonth: plan.maxEmailsPerMonth >= 999999 ? 'Unlimited' : plan.maxEmailsPerMonth,
      phoneMinutesPerMonth: plan.maxPhoneMinutesPerMonth >= 999999 ? 'Unlimited' : plan.maxPhoneMinutesPerMonth,
    },
    features: plan.features,
  }));

  return res.json({ success: true, data: plans });
});

// ---------------------------------------------------------------------------
// GET /usage — Get current organization usage and limits
// ---------------------------------------------------------------------------
router.get('/usage', requireOrg, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT plan, trial_ends_at, plan_started_at,
              stripe_status, stripe_current_period_end, stripe_cancel_at_period_end,
              max_users, max_brands, max_emails_per_month, max_phone_minutes_per_month,
              emails_sent_this_month, phone_minutes_this_month, usage_reset_at
       FROM organizations WHERE id = $1`,
      [req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Organization not found.' });
    }

    const org = result.rows[0];

    const [userCount, brandCount] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE organization_id = $1 AND is_active = TRUE`, [req.organizationId]),
      db.query(`SELECT COUNT(*)::int AS cnt FROM brands WHERE organization_id = $1`, [req.organizationId]),
    ]);

    let trialDaysRemaining = null;
    let trialExpired = false;
    if (org.plan === 'trial' && org.trial_ends_at) {
      const msRemaining = new Date(org.trial_ends_at).getTime() - Date.now();
      trialDaysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
      trialExpired = msRemaining < 0;
    }

    const usageHistory = await db.query(
      `SELECT date_trunc('day', created_at) AS day,
              event_type,
              SUM(quantity)::numeric AS total
       FROM usage_events
       WHERE organization_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY day, event_type
       ORDER BY day DESC`,
      [req.organizationId]
    );

    return res.json({
      success: true,
      data: {
        plan: org.plan,
        planName: PLANS[org.plan]?.name || org.plan,
        planStartedAt: org.plan_started_at,
        trialEndsAt: org.trial_ends_at,
        trialDaysRemaining,
        trialExpired,
        stripe: {
          status: org.stripe_status,
          currentPeriodEnd: org.stripe_current_period_end,
          cancelAtPeriodEnd: org.stripe_cancel_at_period_end,
          delinquent: ['past_due', 'unpaid'].includes(org.stripe_status),
        },
        usage: {
          emails: {
            used: org.emails_sent_this_month,
            limit: org.max_emails_per_month,
            percentage: org.max_emails_per_month > 0
              ? Math.round((org.emails_sent_this_month / org.max_emails_per_month) * 100)
              : 0,
          },
          phoneMinutes: {
            used: parseFloat(org.phone_minutes_this_month),
            limit: org.max_phone_minutes_per_month,
            percentage: org.max_phone_minutes_per_month > 0
              ? Math.round((parseFloat(org.phone_minutes_this_month) / org.max_phone_minutes_per_month) * 100)
              : 0,
          },
          users: { used: userCount.rows[0].cnt, limit: org.max_users },
          brands: { used: brandCount.rows[0].cnt, limit: org.max_brands },
          resetAt: org.usage_reset_at,
        },
        history: usageHistory.rows.map(r => ({
          day: r.day,
          eventType: r.event_type,
          total: parseFloat(r.total),
        })),
      },
    });
  } catch (err) {
    logger.error('Get usage error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /checkout-session — Start Stripe Checkout for a plan upgrade/change
// ---------------------------------------------------------------------------
router.post('/checkout-session', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { plan } = req.body;

    if (!plan || !CHECKOUT_PLANS.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan. Choose one of: ${CHECKOUT_PLANS.join(', ')}`,
      });
    }

    if (!stripeConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payments are not configured yet. Contact support to upgrade.',
      });
    }

    const priceId = env.stripe.prices[plan];
    if (!priceId) {
      return res.status(500).json({
        success: false,
        message: `Stripe price is not configured for the ${plan} plan.`,
      });
    }

    const stripe = getStripe();

    // Ensure we have a Stripe customer
    const customerId = await ensureCustomer(db, {
      organizationId: req.organizationId,
      email: req.user.email,
      name: req.user.name || req.user.email,
    });

    const successUrl = `${env.frontendUrl}/org/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${env.frontendUrl}/org/billing?checkout=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          organization_id: req.organizationId,
          plan,
        },
      },
      metadata: {
        organization_id: req.organizationId,
        plan,
      },
    });

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'billing.checkout_started',
      targetType: 'organization',
      targetId: req.organizationId,
      description: `Started Stripe Checkout for ${plan} plan`,
      organizationId: req.organizationId,
      metadata: { plan, session_id: session.id },
    });

    return res.json({ success: true, data: { url: session.url, sessionId: session.id } });
  } catch (err) {
    logger.error('Checkout session error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to start checkout.' });
  }
});

// ---------------------------------------------------------------------------
// POST /portal-session — Open the Stripe Customer Portal
// ---------------------------------------------------------------------------
router.post('/portal-session', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    if (!stripeConfigured()) {
      return res.status(503).json({ success: false, message: 'Payments are not configured.' });
    }

    const orgResult = await db.query(
      'SELECT stripe_customer_id FROM organizations WHERE id = $1',
      [req.organizationId]
    );
    const customerId = orgResult.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'No billing account yet. Upgrade to a paid plan first.',
      });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.frontendUrl}/org/billing`,
    });

    return res.json({ success: true, data: { url: session.url } });
  } catch (err) {
    logger.error('Portal session error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to open billing portal.' });
  }
});

// ---------------------------------------------------------------------------
// POST /upgrade — Legacy / manual upgrade path (fallback when Stripe disabled)
// Kept for local dev and for Enterprise contracts that skip self-serve.
// ---------------------------------------------------------------------------
router.post('/upgrade', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { plan } = req.body;

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan. Choose one of: ${Object.keys(PLANS).join(', ')}`,
      });
    }

    // Redirect self-serve customers to Checkout when Stripe is configured
    if (stripeConfigured() && CHECKOUT_PLANS.includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Use /billing/checkout-session for self-serve upgrades.',
      });
    }

    const orgResult = await db.query(`SELECT plan FROM organizations WHERE id = $1`, [req.organizationId]);
    if (orgResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Organization not found.' });
    }
    const currentPlan = orgResult.rows[0].plan;
    if (currentPlan === plan) {
      return res.status(400).json({ success: false, message: `Already on the ${PLANS[plan].name} plan.` });
    }

    const planDef = PLANS[plan];

    await db.query(
      `UPDATE organizations
       SET plan = $1,
           plan_started_at = NOW(),
           trial_ends_at = NULL,
           max_users = $2,
           max_brands = $3,
           max_emails_per_month = $4,
           max_phone_minutes_per_month = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [plan, planDef.maxUsers, planDef.maxBrands, planDef.maxEmailsPerMonth, planDef.maxPhoneMinutesPerMonth, req.organizationId]
    );

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'billing.upgrade',
      targetType: 'organization',
      targetId: req.organizationId,
      description: `Upgraded plan from ${currentPlan} to ${plan}`,
      organizationId: req.organizationId,
      metadata: { from: currentPlan, to: plan, price: planDef.price },
    });

    return res.json({
      success: true,
      message: `Successfully upgraded to ${PLANS[plan].name}!`,
      data: { plan, planName: PLANS[plan].name },
    });
  } catch (err) {
    logger.error('Upgrade plan error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// GET /invoices — Pull real invoices from Stripe (falls back to usage grouping)
// ---------------------------------------------------------------------------
router.get('/invoices', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    if (stripeConfigured()) {
      const orgResult = await db.query(
        'SELECT stripe_customer_id FROM organizations WHERE id = $1',
        [req.organizationId]
      );
      const customerId = orgResult.rows[0]?.stripe_customer_id;

      if (customerId) {
        const stripe = getStripe();
        const invoices = await stripe.invoices.list({ customer: customerId, limit: 24 });

        return res.json({
          success: true,
          data: invoices.data.map(inv => ({
            id: inv.id,
            number: inv.number,
            created: new Date(inv.created * 1000),
            amountDue: inv.amount_due,
            amountPaid: inv.amount_paid,
            currency: inv.currency,
            status: inv.status,
            hostedUrl: inv.hosted_invoice_url,
            pdfUrl: inv.invoice_pdf,
            periodStart: new Date(inv.period_start * 1000),
            periodEnd: new Date(inv.period_end * 1000),
          })),
        });
      }
    }

    // Fallback: monthly usage grouping (original behaviour)
    const result = await db.query(
      `SELECT date_trunc('month', created_at) AS month,
              event_type,
              SUM(quantity)::numeric AS total,
              COUNT(*)::int AS event_count
       FROM usage_events
       WHERE organization_id = $1
       GROUP BY month, event_type
       ORDER BY month DESC
       LIMIT 24`,
      [req.organizationId]
    );

    return res.json({
      success: true,
      data: result.rows.map(r => ({
        month: r.month,
        eventType: r.event_type,
        total: parseFloat(r.total),
        eventCount: r.event_count,
      })),
    });
  } catch (err) {
    logger.error('Get invoices error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// Export PLANS so other modules (checkUsageLimit, webhook handler) can use it
router.PLANS = PLANS;
module.exports = router;
module.exports.PLANS = PLANS;
