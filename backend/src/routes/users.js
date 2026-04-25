const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requirePermission } = require('../middleware/rbac');
const audit = require('../services/audit');

const router = express.Router();

// All user-management routes require authentication + org scope
router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// GET / — List all users (admin only)
// ---------------------------------------------------------------------------
router.get('/', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at,
              u.created_at, u.updated_at,
              r.name AS role_name, r.description AS role_description
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.organization_id = $1
       ORDER BY u.created_at DESC`,
      [req.organizationId]
    );

    return res.json({
      success: true,
      data: result.rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        isActive: u.is_active,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
        role: {
          name: u.role_name,
          description: u.role_description,
        },
      })),
    });
  } catch (err) {
    logger.error('List users error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing users.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST / — Create a new user (admin only)
// ---------------------------------------------------------------------------
router.post('/', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { email, password, fullName, roleId } = req.body;

    // Validation
    if (!email || !password || !fullName || !roleId) {
      return res.status(400).json({
        success: false,
        message: 'email, password, fullName, and roleId are all required.',
      });
    }

    const emailNormalized = email.toLowerCase().trim();

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNormalized)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format.',
      });
    }

    // Check email uniqueness within this org
    const existing = await db.query(
      `SELECT id FROM users WHERE email = $1 AND organization_id = $2`,
      [emailNormalized, req.organizationId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists.',
      });
    }

    // Verify role exists
    const roleResult = await db.query(`SELECT id, name FROM roles WHERE id = $1`, [roleId]);
    if (roleResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The specified role does not exist.',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    const insertResult = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active, organization_id)
       VALUES ($1, $2, $3, $4, true, $5)
       RETURNING id, email, full_name, is_active, created_at`,
      [emailNormalized, passwordHash, fullName.trim(), roleId, req.organizationId]
    );

    const newUser = insertResult.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'user.create',
      targetType: 'user',
      targetId: newUser.id,
      description: `Admin created user ${emailNormalized} with role ${roleResult.rows[0].name}`,
      metadata: { email: emailNormalized, role: roleResult.rows[0].name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('User created', { userId: newUser.id, email: emailNormalized, createdBy: req.user.id });

    return res.status(201).json({
      success: true,
      data: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.full_name,
        isActive: newUser.is_active,
        createdAt: newUser.created_at,
        role: roleResult.rows[0].name,
      },
    });
  } catch (err) {
    logger.error('Create user error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the user.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — Update a user (admin only)
// ---------------------------------------------------------------------------
router.put('/:id', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, roleId, isActive } = req.body;

    // Verify user exists within this org
    const userCheck = await db.query(
      `SELECT id, email FROM users WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const existingUser = userCheck.rows[0];

    // Build dynamic SET clause for provided fields only
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    if (fullName !== undefined) {
      setClauses.push(`full_name = $${paramIndex++}`);
      params.push(fullName.trim());
    }

    if (email !== undefined) {
      const emailNormalized = email.toLowerCase().trim();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailNormalized)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format.',
        });
      }

      // Check uniqueness (exclude current user)
      const duplicate = await db.query(
        `SELECT id FROM users WHERE email = $1 AND id != $2`,
        [emailNormalized, id]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'A user with this email already exists.',
        });
      }

      setClauses.push(`email = $${paramIndex++}`);
      params.push(emailNormalized);
    }

    if (roleId !== undefined) {
      const roleResult = await db.query(`SELECT id FROM roles WHERE id = $1`, [roleId]);
      if (roleResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'The specified role does not exist.',
        });
      }
      setClauses.push(`role_id = $${paramIndex++}`);
      params.push(roleId);
    }

    if (isActive !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update.',
      });
    }

    setClauses.push(`updated_at = NOW()`);

    // Add user id as the final parameter
    params.push(id);
    const idPlaceholder = `$${paramIndex}`;

    const updateResult = await db.query(
      `UPDATE users
       SET ${setClauses.join(', ')}
       WHERE id = ${idPlaceholder}
       RETURNING id, email, full_name, is_active, role_id, updated_at`,
      params
    );

    const updatedUser = updateResult.rows[0];

    // Fetch role name for the response
    const roleInfo = await db.query(`SELECT name FROM roles WHERE id = $1`, [updatedUser.role_id]);

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'user.update',
      targetType: 'user',
      targetId: id,
      description: `Admin updated user ${existingUser.email}`,
      metadata: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('User updated', { userId: id, updatedBy: req.user.id });

    return res.json({
      success: true,
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.full_name,
        isActive: updatedUser.is_active,
        updatedAt: updatedUser.updated_at,
        role: roleInfo.rows.length > 0 ? roleInfo.rows[0].name : null,
      },
    });
  } catch (err) {
    logger.error('Update user error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the user.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id — Soft-deactivate a user (admin only)
// ---------------------------------------------------------------------------
router.delete('/:id', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user exists within this org
    const userCheck = await db.query(
      `SELECT id, email, full_name, is_active FROM users WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const targetUser = userCheck.rows[0];

    // Prevent self-deactivation
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account.',
      });
    }

    if (!targetUser.is_active) {
      return res.status(400).json({
        success: false,
        message: 'User is already deactivated.',
      });
    }

    // Soft deactivate
    await db.query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Invalidate all refresh tokens for the deactivated user
    await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [id]);

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'user.deactivate',
      targetType: 'user',
      targetId: id,
      description: `Admin deactivated user ${targetUser.email}`,
      metadata: { deactivatedEmail: targetUser.email },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('User deactivated', { userId: id, deactivatedBy: req.user.id });

    return res.json({
      success: true,
      message: `User ${targetUser.email} has been deactivated.`,
    });
  } catch (err) {
    logger.error('Deactivate user error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deactivating the user.',
    });
  }
});

module.exports = router;
