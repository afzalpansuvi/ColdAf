const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const audit = require('../services/audit');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role_name,
      permissions: user.permissions || [],
      organizationId: user.organization_id || null,
      organizationSlug: user.organization_slug || null,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiry }
  );
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
    + '-' + crypto.randomBytes(3).toString('hex');
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function setAccessTokenCookie(res, token) {
  res.cookie('access_token', token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'Strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    path: '/',
  });
}

function setRefreshTokenCookie(res, token) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    // Fetch user with role + organization info
    const userResult = await db.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.is_active,
              u.organization_id,
              r.name AS role_name, r.permissions,
              o.id AS org_id, o.slug AS organization_slug, o.name AS organization_name,
              o.plan AS org_plan, o.is_active AS org_active
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    // Check if super_admin has been approved by platform owner
    if (user.role_name === 'super_admin') {
      const reqResult = await db.query(
        `SELECT status FROM super_admin_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      );
      const reqStatus = reqResult.rows[0]?.status;
      if (reqStatus === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'Your account is pending approval by the platform owner.',
          code: 'PENDING_APPROVAL',
        });
      }
      if (reqStatus === 'declined') {
        return res.status(403).json({
          success: false,
          message: 'Your account request has been declined.',
          code: 'APPROVAL_DECLINED',
        });
      }
      if (reqStatus === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been suspended by the platform owner.',
          code: 'ACCOUNT_SUSPENDED',
        });
      }
    }

    // Check if organization is active (for org-bound users)
    if (user.org_id && !user.org_active && user.role_name !== 'platform_owner') {
      return res.status(403).json({
        success: false,
        message: 'Your organization has been suspended. Contact support.',
        code: 'ORG_SUSPENDED',
      });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    // Store refresh token in database
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, refreshToken, refreshExpiresAt]
    );

    // Update last_login_at
    await db.query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    );

    // Set cookies
    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, refreshToken);

    // Audit log
    await audit.logAction({
      actorId: user.id,
      actorName: user.full_name,
      actionType: 'user.login',
      targetType: 'user',
      targetId: user.id,
      description: `User ${user.email} logged in`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('User logged in', { userId: user.id, email: user.email });

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role_name,
          permissions: user.permissions,
        },
        organization: user.org_id ? {
          id: user.org_id,
          name: user.organization_name,
          slug: user.organization_slug,
          plan: user.org_plan,
        } : null,
      },
    });
  } catch (err) {
    logger.error('Login error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during login.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /refresh
// ---------------------------------------------------------------------------
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies && req.cookies.refresh_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided.',
      });
    }

    // Validate token against the database
    const tokenResult = await db.query(
      `SELECT rt.id, rt.user_id, rt.expires_at,
              u.email, u.full_name, u.is_active, u.organization_id,
              r.name AS role_name, r.permissions,
              o.slug AS organization_slug
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE rt.token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token.',
      });
    }

    const record = tokenResult.rows[0];

    // Check expiry
    if (new Date(record.expires_at) < new Date()) {
      // Clean up expired token
      await db.query(`DELETE FROM refresh_tokens WHERE id = $1`, [record.id]);
      return res.status(401).json({
        success: false,
        message: 'Refresh token has expired. Please log in again.',
        code: 'REFRESH_EXPIRED',
      });
    }

    if (!record.is_active) {
      await db.query(`DELETE FROM refresh_tokens WHERE id = $1`, [record.id]);
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated.',
      });
    }

    // Issue new access token
    const accessToken = generateAccessToken({
      id: record.user_id,
      email: record.email,
      role_name: record.role_name,
      permissions: record.permissions,
      organization_id: record.organization_id,
      organization_slug: record.organization_slug,
    });

    setAccessTokenCookie(res, accessToken);

    return res.json({
      success: true,
      message: 'Token refreshed successfully.',
    });
  } catch (err) {
    logger.error('Token refresh error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during token refresh.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies && req.cookies.refresh_token;

    // Attempt to identify the user for auditing from the access token
    let userId = null;
    let userName = 'Unknown';
    const accessToken = req.cookies && req.cookies.access_token;
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, env.jwt.secret, { ignoreExpiration: true });
        userId = decoded.id;
        userName = decoded.email;
      } catch (_) {
        // Token may be malformed; proceed with logout anyway
      }
    }

    // Delete the refresh token from the database
    if (refreshToken) {
      await db.query(`DELETE FROM refresh_tokens WHERE token = $1`, [refreshToken]);
    }

    // Clear cookies
    res.clearCookie('access_token', { httpOnly: true, sameSite: 'Strict', path: '/' });
    res.clearCookie('refresh_token', { httpOnly: true, sameSite: 'Strict', path: '/' });

    // Audit log
    await audit.logAction({
      actorId: userId,
      actorName: userName,
      actionType: 'user.logout',
      targetType: 'user',
      targetId: userId,
      description: `User ${userName} logged out`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('User logged out', { userId });

    return res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (err) {
    logger.error('Logout error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during logout.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at,
              u.created_at, u.updated_at, u.organization_id,
              r.name AS role_name, r.description AS role_description, r.permissions,
              o.id AS org_id, o.name AS organization_name, o.slug AS organization_slug,
              o.plan AS org_plan, o.is_active AS org_active,
              o.max_users, o.max_brands, o.max_emails_per_month, o.max_phone_minutes_per_month,
              o.emails_sent_this_month, o.phone_minutes_this_month,
              o.trial_ends_at, o.onboarding_state
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    const user = result.rows[0];

    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        isActive: user.is_active,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        role: {
          name: user.role_name,
          description: user.role_description,
          permissions: user.permissions,
        },
        organization: user.org_id ? {
          id: user.org_id,
          name: user.organization_name,
          slug: user.organization_slug,
          plan: user.org_plan,
          isActive: user.org_active,
          trialEndsAt: user.trial_ends_at,
          onboardingState: user.onboarding_state,
          usage: {
            emailsSent: user.emails_sent_this_month,
            phoneMinutes: parseFloat(user.phone_minutes_this_month || 0),
            maxEmails: user.max_emails_per_month,
            maxPhoneMinutes: user.max_phone_minutes_per_month,
            maxUsers: user.max_users,
            maxBrands: user.max_brands,
          },
        } : null,
      },
    });
  } catch (err) {
    logger.error('Get current user error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /signup/super-admin — Self-serve super admin registration
// ---------------------------------------------------------------------------
router.post('/signup/super-admin', loginLimiter, async (req, res) => {
  try {
    const { email, password, fullName, companyName, reason } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and full name are required.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.',
      });
    }

    // Check if email already exists
    const existing = await db.query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Get super_admin role
    const roleResult = await db.query(`SELECT id FROM roles WHERE name = 'super_admin'`);
    if (roleResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Super admin role not found. Run migrations first.',
      });
    }
    const superAdminRoleId = roleResult.rows[0].id;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user (no organization yet — super_admins create orgs after approval)
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [email.toLowerCase().trim(), passwordHash, fullName, superAdminRoleId]
    );
    const userId = userResult.rows[0].id;

    // Create approval request
    await db.query(
      `INSERT INTO super_admin_requests (user_id, company_name, reason, status)
       VALUES ($1, $2, $3, 'pending')`,
      [userId, companyName || null, reason || null]
    );

    // Audit log
    await audit.logAction({
      actorId: userId,
      actorName: fullName,
      actionType: 'super_admin.signup',
      targetType: 'user',
      targetId: userId,
      description: `Super admin signup request from ${email}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Super admin signup request', { userId, email });

    return res.status(201).json({
      success: true,
      message: 'Your account has been created and is pending approval by the platform owner.',
      data: { id: userId, email, status: 'pending_approval' },
    });
  } catch (err) {
    logger.error('Super admin signup error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred during signup.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /signup/organization — Create org (for approved super_admins)
// ---------------------------------------------------------------------------
router.post('/signup/organization', authenticate, async (req, res) => {
  try {
    const { organizationName } = req.body;

    if (!organizationName) {
      return res.status(400).json({
        success: false,
        message: 'Organization name is required.',
      });
    }

    // Only super_admin and platform_owner can create orgs
    if (!['super_admin', 'platform_owner'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only super admins can create organizations.',
      });
    }

    const slug = generateSlug(organizationName);
    const trialEndsAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days

    // Create the organization
    const orgResult = await db.query(
      `INSERT INTO organizations (name, slug, owner_id, plan, trial_ends_at)
       VALUES ($1, $2, $3, 'trial', $4)
       RETURNING id, slug, plan, trial_ends_at`,
      [organizationName, slug, req.user.id, trialEndsAt]
    );

    const org = orgResult.rows[0];

    // Get org_admin role for the owner within this org
    const orgAdminRole = await db.query(`SELECT id FROM roles WHERE name = 'org_admin'`);

    // Create an org_admin user entry for the super_admin within this org
    // (the super_admin themselves remain a super_admin, but they also
    //  get associated with this org for data scoping)
    // Update the super_admin's organization_id if they don't have one yet
    if (!req.user.organizationId) {
      await db.query(
        `UPDATE users SET organization_id = $1 WHERE id = $2`,
        [org.id, req.user.id]
      );
    }

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'organization.create',
      targetType: 'organization',
      targetId: org.id,
      description: `Created organization "${organizationName}"`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Organization created', { orgId: org.id, name: organizationName, owner: req.user.id });

    return res.status(201).json({
      success: true,
      data: {
        id: org.id,
        name: organizationName,
        slug: org.slug,
        plan: org.plan,
        trialEndsAt: org.trial_ends_at,
      },
    });
  } catch (err) {
    logger.error('Organization creation error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the organization.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /accept-invitation — Accept an org invitation and create account
// ---------------------------------------------------------------------------
router.post('/accept-invitation', loginLimiter, async (req, res) => {
  try {
    const { token, password, fullName } = req.body;

    if (!token || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: 'Invitation token, password, and full name are required.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.',
      });
    }

    // Find the invitation
    const invResult = await db.query(
      `SELECT i.id, i.organization_id, i.email, i.role_id, i.status, i.expires_at,
              o.name AS organization_name, o.slug AS organization_slug, o.plan AS org_plan
       FROM organization_invitations i
       JOIN organizations o ON o.id = i.organization_id
       WHERE i.token = $1`,
      [token]
    );

    if (invResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Invalid invitation token.',
      });
    }

    const invitation = invResult.rows[0];

    if (invitation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `This invitation has already been ${invitation.status}.`,
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await db.query(`UPDATE organization_invitations SET status = 'expired' WHERE id = $1`, [invitation.id]);
      return res.status(400).json({
        success: false,
        message: 'This invitation has expired. Please request a new one.',
      });
    }

    // Check if user already exists
    const existingUser = await db.query(`SELECT id FROM users WHERE email = $1`, [invitation.email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please log in instead.',
      });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, organization_id, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id`,
      [invitation.email, passwordHash, fullName, invitation.role_id, invitation.organization_id]
    );
    const userId = userResult.rows[0].id;

    // Mark invitation as accepted
    await db.query(
      `UPDATE organization_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
      [invitation.id]
    );

    // Fetch role info for token generation
    const roleResult = await db.query(
      `SELECT r.name AS role_name, r.permissions FROM roles r WHERE r.id = $1`,
      [invitation.role_id]
    );
    const role = roleResult.rows[0];

    // Generate tokens and log in
    const accessToken = generateAccessToken({
      id: userId,
      email: invitation.email,
      role_name: role.role_name,
      permissions: role.permissions,
      organization_id: invitation.organization_id,
      organization_slug: invitation.organization_slug,
    });
    const refreshToken = generateRefreshToken();

    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [userId, refreshToken, refreshExpiresAt]
    );

    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, refreshToken);

    // Audit log
    await audit.logAction({
      actorId: userId,
      actorName: fullName,
      actionType: 'invitation.accepted',
      targetType: 'organization',
      targetId: invitation.organization_id,
      description: `${invitation.email} accepted invitation to ${invitation.organization_name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      organizationId: invitation.organization_id,
    });

    logger.info('Invitation accepted', { userId, orgId: invitation.organization_id });

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: userId,
          email: invitation.email,
          fullName,
          role: role.role_name,
          permissions: role.permissions,
        },
        organization: {
          id: invitation.organization_id,
          name: invitation.organization_name,
          slug: invitation.organization_slug,
          plan: invitation.org_plan,
        },
      },
    });
  } catch (err) {
    logger.error('Accept invitation error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while accepting the invitation.',
    });
  }
});

module.exports = router;
