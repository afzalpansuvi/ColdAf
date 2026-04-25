const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requirePlatformOwner } = require('../middleware/requirePlatformOwner');
const audit = require('../services/audit');

const router = express.Router();

// All platform routes require authentication + platform owner
router.use(authenticate);
router.use(requirePlatformOwner);

// ---------------------------------------------------------------------------
// GET /super-admins — List all super admins with their request status
// ---------------------------------------------------------------------------
router.get('/super-admins', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.created_at, u.last_login_at,
              sar.id AS request_id, sar.company_name, sar.reason, sar.status AS approval_status,
              sar.reviewed_at, sar.review_notes, sar.created_at AS request_date,
              (SELECT COUNT(*)::int FROM organizations WHERE owner_id = u.id) AS org_count
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN super_admin_requests sar ON sar.user_id = u.id
       WHERE r.name = 'super_admin'
       ORDER BY sar.created_at DESC`
    );

    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        isActive: row.is_active,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        requestId: row.request_id,
        companyName: row.company_name,
        reason: row.reason,
        approvalStatus: row.approval_status || 'no_request',
        reviewedAt: row.reviewed_at,
        reviewNotes: row.review_notes,
        requestDate: row.request_date,
        orgCount: row.org_count,
      })),
    });
  } catch (err) {
    logger.error('List super admins error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// GET /super-admins/pending — List pending approval requests
// ---------------------------------------------------------------------------
router.get('/super-admins/pending', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sar.id, sar.user_id, sar.company_name, sar.reason, sar.created_at,
              u.email, u.full_name
       FROM super_admin_requests sar
       JOIN users u ON u.id = sar.user_id
       WHERE sar.status = 'pending'
       ORDER BY sar.created_at ASC`
    );

    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        email: row.email,
        fullName: row.full_name,
        companyName: row.company_name,
        reason: row.reason,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    logger.error('List pending requests error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /super-admins/:id/approve — Approve a super admin
// ---------------------------------------------------------------------------
router.post('/super-admins/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNotes } = req.body;

    const result = await db.query(
      `UPDATE super_admin_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING user_id`,
      [req.user.id, reviewNotes || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pending request not found.',
      });
    }

    const userId = result.rows[0].user_id;

    // Audit
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'super_admin.approve',
      targetType: 'user',
      targetId: userId,
      description: `Approved super admin request ${id}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Super admin approved', { requestId: id, userId });

    return res.json({ success: true, message: 'Super admin approved.' });
  } catch (err) {
    logger.error('Approve super admin error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /super-admins/:id/decline — Decline a super admin request
// ---------------------------------------------------------------------------
router.post('/super-admins/:id/decline', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewNotes } = req.body;

    const result = await db.query(
      `UPDATE super_admin_requests
       SET status = 'declined', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING user_id`,
      [req.user.id, reviewNotes || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pending request not found.',
      });
    }

    const userId = result.rows[0].user_id;

    // Deactivate the user account
    await db.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [userId]);

    // Audit
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'super_admin.decline',
      targetType: 'user',
      targetId: userId,
      description: `Declined super admin request ${id}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Super admin declined', { requestId: id, userId });

    return res.json({ success: true, message: 'Super admin request declined.' });
  } catch (err) {
    logger.error('Decline super admin error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /super-admins/:id/suspend — Suspend an active super admin
// ---------------------------------------------------------------------------
router.post('/super-admins/:id/suspend', async (req, res) => {
  try {
    const { id } = req.params;  // This is the request ID
    const { reviewNotes } = req.body;

    const result = await db.query(
      `UPDATE super_admin_requests
       SET status = 'suspended', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 AND status = 'approved'
       RETURNING user_id`,
      [req.user.id, reviewNotes || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Approved super admin request not found.',
      });
    }

    const userId = result.rows[0].user_id;

    // Deactivate user
    await db.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [userId]);

    // Mark all their organizations as inactive (read-only)
    await db.query(
      `UPDATE organizations SET is_active = FALSE WHERE owner_id = $1`,
      [userId]
    );

    // Audit
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'super_admin.suspend',
      targetType: 'user',
      targetId: userId,
      description: `Suspended super admin and their organizations`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Super admin suspended', { requestId: id, userId });

    return res.json({ success: true, message: 'Super admin suspended. Their organizations are now read-only.' });
  } catch (err) {
    logger.error('Suspend super admin error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /super-admins/:id/reactivate — Reactivate a suspended super admin
// ---------------------------------------------------------------------------
router.post('/super-admins/:id/reactivate', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE super_admin_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2 AND status = 'suspended'
       RETURNING user_id`,
      [req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Suspended super admin request not found.',
      });
    }

    const userId = result.rows[0].user_id;

    // Reactivate user
    await db.query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [userId]);

    // Reactivate their organizations
    await db.query(
      `UPDATE organizations SET is_active = TRUE WHERE owner_id = $1`,
      [userId]
    );

    // Audit
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'super_admin.reactivate',
      targetType: 'user',
      targetId: userId,
      description: `Reactivated super admin and their organizations`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Super admin reactivated', { requestId: id, userId });

    return res.json({ success: true, message: 'Super admin reactivated.' });
  } catch (err) {
    logger.error('Reactivate super admin error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// GET /analytics — Platform-wide stats
// ---------------------------------------------------------------------------
router.get('/analytics', async (req, res) => {
  try {
    const [orgs, users, emails, superAdmins] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active) ::int AS active FROM organizations`),
      db.query(`SELECT COUNT(*)::int AS total FROM users`),
      db.query(`SELECT COALESCE(SUM(emails_sent_this_month), 0)::int AS total_emails FROM organizations`),
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE sar.status = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE sar.status = 'approved')::int AS approved,
           COUNT(*) FILTER (WHERE sar.status = 'suspended')::int AS suspended
         FROM super_admin_requests sar`
      ),
    ]);

    return res.json({
      success: true,
      data: {
        organizations: {
          total: orgs.rows[0].total,
          active: orgs.rows[0].active,
        },
        users: {
          total: users.rows[0].total,
        },
        emails: {
          totalThisMonth: emails.rows[0].total_emails,
        },
        superAdmins: superAdmins.rows[0],
      },
    });
  } catch (err) {
    logger.error('Platform analytics error', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

module.exports = router;
