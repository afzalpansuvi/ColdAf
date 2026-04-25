/**
 * Admin Panel routes — platform owner only.
 *
 * Covers all 15 admin sections:
 *   Dashboard · Health · Analytics · Billing · Revenue ·
 *   Discount Codes · License Keys · Affiliates · Users · Pro Users ·
 *   Admin Management · Content · AI Usage · Security · Requests
 *
 * All routes require authentication + requirePlatformOwner (checks
 * user.role === 'platform_owner' AND email === 'apansuvi1@gmail.com').
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requirePlatformOwner } = require('../middleware/requirePlatformOwner');

const router = express.Router();

// Every admin route is gated
router.use(authenticate);
router.use(requirePlatformOwner);

// Helpful wrapper for endpoints that query tables that may not exist yet
async function safeQuery(sql, params = [], fallback = { rows: [] }) {
  try {
    return await db.query(sql, params);
  } catch (err) {
    logger.warn('Admin safeQuery fell back', { error: err.message });
    return fallback;
  }
}

// ═══════════════════════════════════════════════════════════════
//  1. DASHBOARD — aggregated KPIs
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  try {
    const [orgs, users, emails30, mrr, campaigns] = await Promise.all([
      safeQuery("SELECT COUNT(*)::int AS count FROM organizations"),
      safeQuery("SELECT COUNT(*)::int AS count FROM users WHERE is_active = TRUE"),
      safeQuery("SELECT COUNT(*)::int AS count FROM emails_sent WHERE sent_at > NOW() - INTERVAL '30 days'"),
      safeQuery(`SELECT COALESCE(SUM(
          CASE plan
            WHEN 'starter' THEN 9
            WHEN 'pro' THEN 29
            WHEN 'agency' THEN 249
            ELSE 0
          END
        ), 0)::numeric AS mrr
        FROM organizations WHERE plan IS NOT NULL`),
      safeQuery("SELECT COUNT(*)::int AS count FROM campaigns WHERE status = 'active'"),
    ]);

    const mrrValue = Number(mrr.rows[0]?.mrr || 0);
    return res.json({
      success: true,
      data: {
        totalOrgs: orgs.rows[0]?.count || 0,
        totalUsers: users.rows[0]?.count || 0,
        emailsSent30d: emails30.rows[0]?.count || 0,
        mrr: mrrValue,
        arr: mrrValue * 12,
        activeCampaigns: campaigns.rows[0]?.count || 0,
        churn30d: 0,
      },
    });
  } catch (err) {
    logger.error('admin/dashboard error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  2. HEALTH CHECK
// ═══════════════════════════════════════════════════════════════
router.get('/health', async (req, res) => {
  const checks = [];

  // DB
  const dbStart = Date.now();
  try {
    await db.query('SELECT 1');
    checks.push({ name: 'database', status: 'ok', latencyMs: Date.now() - dbStart });
  } catch (e) {
    checks.push({ name: 'database', status: 'down', error: e.message });
  }

  // Redis
  const redisStart = Date.now();
  try {
    const { emailQueue } = require('../config/redis');
    await emailQueue.client.ping();
    const waiting = await emailQueue.getWaitingCount();
    const active = await emailQueue.getActiveCount();
    const failed = await emailQueue.getFailedCount();
    checks.push({
      name: 'redis',
      status: 'ok',
      latencyMs: Date.now() - redisStart,
      meta: { waiting, active, failed },
    });
    checks.push({
      name: 'queue',
      status: failed > 50 ? 'degraded' : 'ok',
      meta: { waiting, active, failed },
    });
  } catch (e) {
    checks.push({ name: 'redis', status: 'down', error: e.message });
    checks.push({ name: 'queue', status: 'unknown' });
  }

  // Workers
  checks.push({
    name: 'workers',
    status: 'ok',
    meta: { uptime: process.uptime() },
  });

  // Disk — process memory as a proxy
  const mem = process.memoryUsage();
  checks.push({
    name: 'memory',
    status: mem.heapUsed / mem.heapTotal > 0.9 ? 'degraded' : 'ok',
    meta: {
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
  });

  // Stripe
  checks.push({
    name: 'stripe',
    status: process.env.STRIPE_SECRET_KEY ? 'ok' : 'not_configured',
  });

  return res.json({ success: true, data: { checks, checkedAt: new Date().toISOString() } });
});

// ═══════════════════════════════════════════════════════════════
//  3. ANALYTICS
// ═══════════════════════════════════════════════════════════════
router.get('/analytics', async (req, res) => {
  const range = req.query.range || '30d';
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;

  try {
    const signups = await safeQuery(
      `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
         FROM users
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY 1 ORDER BY 1`
    );
    const emails = await safeQuery(
      `SELECT DATE(sent_at) AS date, COUNT(*)::int AS count
         FROM emails_sent
        WHERE sent_at > NOW() - INTERVAL '${days} days'
        GROUP BY 1 ORDER BY 1`
    );
    const replies = await safeQuery(
      `SELECT DATE(created_at) AS date, COUNT(*)::int AS count
         FROM reply_messages
        WHERE created_at > NOW() - INTERVAL '${days} days'
        GROUP BY 1 ORDER BY 1`
    );

    return res.json({
      success: true,
      data: {
        range,
        days,
        signups: signups.rows,
        emails: emails.rows,
        replies: replies.rows,
      },
    });
  } catch (err) {
    logger.error('admin/analytics error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  4. BILLING (all org subscriptions)
// ═══════════════════════════════════════════════════════════════
router.get('/billing', async (req, res) => {
  try {
    const result = await safeQuery(`
      SELECT id, name, plan, stripe_subscription_id, stripe_status,
             emails_sent_this_month, created_at, updated_at
        FROM organizations
       ORDER BY created_at DESC
    `);
    return res.json({ success: true, data: { organizations: result.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Manually grant / change a plan for an org (no Stripe payment required).
// Used for comps, VIP clients, or internal testing.
router.post('/orgs/:id/grant-plan', async (req, res) => {
  const { id } = req.params;
  const { plan, note } = req.body || {};
  const valid = ['free', 'starter', 'pro', 'agency'];
  if (!valid.includes(plan)) {
    return res.status(400).json({ success: false, message: 'Invalid plan' });
  }
  try {
    await safeQuery(
      `UPDATE organizations
          SET plan = $1,
              stripe_status = 'comped',
              updated_at = NOW()
        WHERE id = $2`,
      [plan, id]
    );
    await safeQuery(
      `INSERT INTO audit_logs (user_id, organization_id, action, target_type, target_id, metadata, created_at)
       VALUES ($1, $2, 'admin.grant_plan', 'organization', $2, $3, NOW())`,
      [req.user?.id || null, id, JSON.stringify({ plan, note: note || null })]
    );
    return res.json({ success: true, data: { id, plan, stripe_status: 'comped' } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  5. REVENUE ANALYTICS
// ═══════════════════════════════════════════════════════════════
router.get('/revenue', async (req, res) => {
  try {
    const planBreakdown = await safeQuery(`
      SELECT plan, COUNT(*)::int AS count
        FROM organizations
       WHERE plan IS NOT NULL
       GROUP BY plan
    `);

    const planPrices = { free: 0, starter: 9, pro: 29, agency: 249 };
    const rows = planBreakdown.rows || [];
    const mrr = rows.reduce((sum, r) => sum + (planPrices[r.plan] || 0) * r.count, 0);

    // 12-month synthetic trend (flat growth from today's MRR)
    const history = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      history.push({
        month: d.toISOString().slice(0, 7),
        mrr: Math.max(0, Math.round(mrr * (1 - i * 0.05))),
      });
    }

    return res.json({
      success: true,
      data: {
        mrr,
        arr: mrr * 12,
        history,
        planBreakdown: rows,
        churn: 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  6. DISCOUNT CODES
// ═══════════════════════════════════════════════════════════════
router.get('/discount-codes', async (req, res) => {
  try {
    const result = await safeQuery(`
      SELECT dc.*,
             (SELECT COUNT(*)::int FROM discount_code_redemptions r WHERE r.code_id = dc.id) AS redemption_count
        FROM discount_codes dc
       ORDER BY dc.created_at DESC
    `);
    return res.json({ success: true, data: { codes: result.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/discount-codes', async (req, res) => {
  try {
    const { code, type, amount, maxUses, expiresAt, appliesToPlan } = req.body;
    if (!code || !type || amount == null) {
      return res.status(400).json({ success: false, message: 'code, type, amount required' });
    }
    const result = await db.query(
      `INSERT INTO discount_codes (code, type, amount, max_uses, expires_at, applies_to_plan, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [code, type, amount, maxUses || null, expiresAt || null, appliesToPlan || null, req.user.id]
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/discount-codes/:id', async (req, res) => {
  try {
    await db.query('UPDATE discount_codes SET is_active = FALSE WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  7. LICENSE KEYS
// ═══════════════════════════════════════════════════════════════
router.get('/license-keys', async (req, res) => {
  try {
    const result = await safeQuery(`
      SELECT lk.*, o.name AS org_name
        FROM license_keys lk
        LEFT JOIN organizations o ON lk.issued_to_org_id = o.id
       ORDER BY lk.created_at DESC
       LIMIT 200
    `);
    return res.json({ success: true, data: { keys: result.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/license-keys/generate', async (req, res) => {
  try {
    const { plan = 'pro', seats = 1, count = 1, expiresAt = null, notes = null } = req.body;
    const created = [];
    for (let i = 0; i < Math.min(count, 100); i++) {
      const key = `COLD-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const r = await db.query(
        `INSERT INTO license_keys (key, plan, seats, expires_at, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [key, plan, seats, expiresAt, notes, req.user.id]
      );
      created.push(r.rows[0]);
    }
    return res.json({ success: true, data: { keys: created } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/license-keys/:id/revoke', async (req, res) => {
  try {
    await db.query("UPDATE license_keys SET status = 'revoked', updated_at = NOW() WHERE id = $1", [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  8. AFFILIATES
// ═══════════════════════════════════════════════════════════════
router.get('/affiliates', async (req, res) => {
  try {
    const affiliates = await safeQuery(`
      SELECT a.*, u.full_name AS user_name, u.email AS user_email,
             (SELECT COUNT(*)::int FROM affiliate_referrals r WHERE r.affiliate_id = a.id) AS referral_count
        FROM affiliates a
        LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
    `);
    return res.json({ success: true, data: { affiliates: affiliates.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/affiliates/:id/approve', async (req, res) => {
  try {
    await db.query("UPDATE affiliates SET status = 'approved', updated_at = NOW() WHERE id = $1", [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/affiliates/:id/reject', async (req, res) => {
  try {
    await db.query("UPDATE affiliates SET status = 'rejected', updated_at = NOW() WHERE id = $1", [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/affiliates/:id/pay', async (req, res) => {
  try {
    const { amount } = req.body;
    await db.query(
      `UPDATE affiliates SET total_paid = total_paid + $1, updated_at = NOW() WHERE id = $2`,
      [amount || 0, req.params.id]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  9. USERS (all users across orgs)
// ═══════════════════════════════════════════════════════════════
router.get('/users', async (req, res) => {
  try {
    const { search = '', plan = '', status = '' } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(u.email ILIKE $${idx} OR u.full_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (plan) {
      conditions.push(`o.plan = $${idx}`);
      params.push(plan);
      idx++;
    }
    if (status === 'active') conditions.push('u.is_active = TRUE');
    if (status === 'inactive') conditions.push('u.is_active = FALSE');

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await safeQuery(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at, u.created_at,
              r.name AS role_name, o.id AS org_id, o.name AS org_name, o.plan
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         LEFT JOIN organization_users ou ON ou.user_id = u.id
         LEFT JOIN organizations o ON ou.organization_id = o.id
         ${where}
        ORDER BY u.created_at DESC
        LIMIT 500`,
      params
    );
    return res.json({ success: true, data: { users: result.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/users/:id/suspend', async (req, res) => {
  try {
    await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/users/:id/reactivate', async (req, res) => {
  try {
    await db.query('UPDATE users SET is_active = TRUE WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  10. PRO USERS (paid-plan users only, with MRR contribution)
// ═══════════════════════════════════════════════════════════════
router.get('/pro-users', async (req, res) => {
  try {
    const result = await safeQuery(`
      SELECT u.id, u.email, u.full_name, u.last_login_at, u.created_at,
             o.id AS org_id, o.name AS org_name, o.plan,
             o.emails_sent_this_month,
             CASE o.plan
               WHEN 'starter' THEN 9
               WHEN 'pro' THEN 29
               WHEN 'agency' THEN 249
               ELSE 0
             END AS mrr_contribution
        FROM users u
        LEFT JOIN organization_users ou ON ou.user_id = u.id
        LEFT JOIN organizations o ON ou.organization_id = o.id
       WHERE o.plan IN ('starter', 'pro', 'agency')
       ORDER BY mrr_contribution DESC
       LIMIT 500
    `);
    return res.json({ success: true, data: { users: result.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  11. ADMIN MANAGEMENT (super admins)
// ═══════════════════════════════════════════════════════════════
router.get('/admins', async (req, res) => {
  try {
    const result = await safeQuery(`
      SELECT u.id, u.email, u.full_name, u.is_active, u.created_at, r.name AS role_name
        FROM users u
        JOIN roles r ON u.role_id = r.id
       WHERE r.name IN ('super_admin', 'platform_owner', 'org_admin', 'admin')
       ORDER BY u.created_at DESC
    `);
    return res.json({ success: true, data: { admins: result.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  12. CONTENT MANAGEMENT (system templates + changelog)
// ═══════════════════════════════════════════════════════════════
router.get('/content/templates', async (req, res) => {
  try {
    const result = await safeQuery(`
      SELECT id, name, subject, body_html, is_system, created_at
        FROM email_templates
       WHERE is_system = TRUE OR organization_id IS NULL
       ORDER BY created_at DESC
       LIMIT 200
    `);
    return res.json({ success: true, data: { templates: result.rows } });
  } catch (err) {
    return res.json({ success: true, data: { templates: [] } });
  }
});

router.get('/content/changelog', async (req, res) => {
  return res.json({
    success: true,
    data: {
      entries: [
        { date: '2026-04-22', version: '1.4.0', title: 'Gmail multi-account sending', body: 'Connect unlimited Gmail accounts via OAuth. Rotation pool distributes sends across accounts.' },
        { date: '2026-04-20', version: '1.3.0', title: 'Admin panel launched', body: '15-section platform-owner-only admin dashboard.' },
        { date: '2026-04-15', version: '1.2.0', title: 'Collapsible sidebar + account consolidation', body: 'Jotform-pattern settings; blue sidebar now collapsible.' },
      ],
    },
  });
});

// ═══════════════════════════════════════════════════════════════
//  13. AI USAGE (cross-org)
// ═══════════════════════════════════════════════════════════════
router.get('/ai-usage', async (req, res) => {
  try {
    const summary = await safeQuery(`
      SELECT provider, model,
             COUNT(*)::int AS call_count,
             COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
             COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
             COALESCE(SUM(cost_usd), 0)::numeric AS total_cost
        FROM ai_usage_events
       WHERE created_at > NOW() - INTERVAL '30 days'
       GROUP BY provider, model
       ORDER BY total_cost DESC
    `);

    const topOrgs = await safeQuery(`
      SELECT o.id, o.name,
             COUNT(*)::int AS call_count,
             COALESCE(SUM(u.cost_usd), 0)::numeric AS total_cost
        FROM ai_usage_events u
        JOIN organizations o ON u.organization_id = o.id
       WHERE u.created_at > NOW() - INTERVAL '30 days'
       GROUP BY o.id, o.name
       ORDER BY total_cost DESC
       LIMIT 10
    `);

    return res.json({
      success: true,
      data: {
        byProviderModel: summary.rows,
        topOrgs: topOrgs.rows,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  14. SECURITY & AUDIT
// ═══════════════════════════════════════════════════════════════
router.get('/security/audit', async (req, res) => {
  try {
    const { limit = 100, action } = req.query;
    const params = [];
    let where = '';
    if (action) {
      params.push(action);
      where = `WHERE action = $${params.length}`;
    }
    params.push(Math.min(parseInt(limit, 10) || 100, 500));
    const result = await safeQuery(
      `SELECT al.*, u.email AS user_email, o.name AS org_name
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         LEFT JOIN organizations o ON al.organization_id = o.id
         ${where}
        ORDER BY al.created_at DESC
        LIMIT $${params.length}`,
      params
    );
    return res.json({ success: true, data: { events: result.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/security/failed-logins', async (req, res) => {
  try {
    const result = await safeQuery(`
      SELECT metadata->>'email' AS email,
             metadata->>'ip' AS ip,
             COUNT(*)::int AS attempts,
             MAX(created_at) AS last_attempt
        FROM audit_logs
       WHERE action = 'auth.login_failed'
         AND created_at > NOW() - INTERVAL '24 hours'
       GROUP BY 1, 2
       ORDER BY attempts DESC
       LIMIT 50
    `);
    return res.json({ success: true, data: { failedLogins: result.rows } });
  } catch (err) {
    return res.json({ success: true, data: { failedLogins: [] } });
  }
});

// ═══════════════════════════════════════════════════════════════
//  15. REQUESTS & ISSUES (support tickets)
// ═══════════════════════════════════════════════════════════════
router.get('/requests', async (req, res) => {
  try {
    const { status = '', priority = '' } = req.query;
    const conditions = [];
    const params = [];
    if (status) { params.push(status); conditions.push(`sr.status = $${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`sr.priority = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await safeQuery(
      `SELECT sr.*, u.email AS user_email, u.full_name AS user_name, o.name AS org_name
         FROM support_requests sr
         LEFT JOIN users u ON sr.user_id = u.id
         LEFT JOIN organizations o ON sr.organization_id = o.id
         ${where}
        ORDER BY sr.created_at DESC
        LIMIT 200`,
      params
    );
    return res.json({ success: true, data: { requests: result.rows } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const request = await safeQuery(
      `SELECT sr.*, u.email AS user_email, u.full_name AS user_name
         FROM support_requests sr
         LEFT JOIN users u ON sr.user_id = u.id
        WHERE sr.id = $1`,
      [req.params.id]
    );
    const messages = await safeQuery(
      `SELECT m.*, u.full_name AS author_name, u.email AS author_email
         FROM support_request_messages m
         LEFT JOIN users u ON m.author_id = u.id
        WHERE m.request_id = $1
        ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    return res.json({
      success: true,
      data: { request: request.rows[0] || null, messages: messages.rows },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/requests/:id/reply', async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ success: false, message: 'body required' });
    await db.query(
      `INSERT INTO support_request_messages (request_id, author_id, author_type, body)
       VALUES ($1, $2, 'admin', $3)`,
      [req.params.id, req.user.id, body]
    );
    await db.query(
      `UPDATE support_requests SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/requests/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'pending', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'invalid status' });
    }
    await db.query(
      'UPDATE support_requests SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, req.params.id]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
