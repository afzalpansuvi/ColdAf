/**
 * Stripe service — thin wrapper around the Stripe SDK.
 *
 * Exposes a lazily-initialised singleton so the server can still boot without
 * Stripe credentials in local/dev mode. Any billing route that needs Stripe
 * must call `getStripe()` and gracefully handle the null case.
 */
const env = require('../config/env');
const logger = require('../utils/logger');

let _stripe = null;

function getStripe() {
  if (_stripe) return _stripe;
  if (!env.stripe.secretKey) {
    return null; // Not configured — caller must handle
  }
  const Stripe = require('stripe');
  _stripe = new Stripe(env.stripe.secretKey, { apiVersion: '2024-06-20' });
  return _stripe;
}

function isConfigured() {
  return Boolean(env.stripe.secretKey);
}

/**
 * Find-or-create a Stripe Customer for an organization.
 * Stores `stripe_customer_id` on the org row so this is a one-time cost.
 */
async function ensureCustomer(db, { organizationId, email, name }) {
  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured');

  const existing = await db.query(
    'SELECT stripe_customer_id FROM organizations WHERE id = $1',
    [organizationId]
  );
  if (existing.rows[0]?.stripe_customer_id) {
    return existing.rows[0].stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { organization_id: organizationId },
  });

  await db.query(
    'UPDATE organizations SET stripe_customer_id = $1, billing_email = $2, updated_at = NOW() WHERE id = $3',
    [customer.id, email, organizationId]
  );

  logger.info('Stripe customer created', { organizationId, customerId: customer.id });
  return customer.id;
}

module.exports = {
  getStripe,
  isConfigured,
  ensureCustomer,
};
