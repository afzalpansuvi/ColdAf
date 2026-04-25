const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

const router = express.Router();

// All notification routes require authentication + org scope
router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// GET / - List notifications for current user with pagination
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 50;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const userId = req.user.id;

    // Count query
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1`,
      [userId]
    );
    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    // Data query
    const offset = (page - 1) * limit;
    const dataResult = await db.query(
      `SELECT id, user_id, type, title, message, metadata, is_read,
              created_at, updated_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        notifications: dataResult.rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          type: r.type,
          title: r.title,
          message: r.message,
          metadata: r.metadata,
          isRead: r.is_read,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    logger.error('List notifications error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing notifications.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /unread-count - Return count of unread notifications
// ---------------------------------------------------------------------------
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );

    return res.json({
      success: true,
      data: {
        unreadCount: result.rows[0].count,
      },
    });
  } catch (err) {
    logger.error('Unread count error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching unread count.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /mark-all-read - Mark all notifications as read for current user
// ---------------------------------------------------------------------------
router.put('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `UPDATE notifications
       SET is_read = TRUE, updated_at = NOW()
       WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );

    logger.info('All notifications marked as read', {
      userId,
      affectedCount: result.rowCount,
    });

    return res.json({
      success: true,
      message: `${result.rowCount} notification(s) marked as read.`,
      data: { affectedCount: result.rowCount },
    });
  } catch (err) {
    logger.error('Mark all read error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while marking notifications as read.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/read - Mark a single notification as read
// ---------------------------------------------------------------------------
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      `UPDATE notifications
       SET is_read = TRUE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found.',
      });
    }

    return res.json({
      success: true,
      message: 'Notification marked as read.',
      data: {
        id: result.rows[0].id,
        isRead: result.rows[0].is_read,
      },
    });
  } catch (err) {
    logger.error('Mark notification read error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while marking the notification as read.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - Delete a notification
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found.',
      });
    }

    return res.json({
      success: true,
      message: 'Notification deleted.',
    });
  } catch (err) {
    logger.error('Delete notification error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deleting the notification.',
    });
  }
});

module.exports = router;
