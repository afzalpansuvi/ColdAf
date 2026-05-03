const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requirePermission } = require('../middleware/rbac');
const { checkUsageLimit } = require('../middleware/checkUsageLimit');
const audit = require('../services/audit');

const router = express.Router();

router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// GET / — Get current organization details
// ---------------------------------------------------------------------------
router.get('/', requireOrg, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, slug, owner_id, logo_url, website, plan,
              plan_started_at, trial_ends_at, is_active,
              max_users, max_brands, max_emails_per_month, max_phone_minutes_per_month,
              emails_sent_this_month, phone_minutes_this_month, usage_reset_at,
              onboarding_state, custom_domain, created_at, updated_at
       FROM organizations WHERE id = $1`,
      [req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Organization not found.' });
    }

    const org = result.rows[0];
    return res.json({
      success: true,
      data: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        ownerId: org.owner_id,
        logoUrl: org.logo_url,
        website: org.website,
        plan: org.plan,
        planStartedAt: org.plan_started_at,
        trialEndsAt: org.trial_ends_at,
        isActive: org.is_active,
        customDomain: org.custom_domain,
        onboardingState: org.onboarding_state,
        usage: {
          emailsSent: org.emails_sent_this_month,
          phoneMinutes: parseFloat(org.phone_minutes_this_month),
          maxEmails: org.max_emails_per_month,
          maxPhoneMinutes: org.max_phone_minutes_per_month,
          maxUsers: org.max_users,
          maxBrands: org.max_brands,
          resetAt: org.usage_reset_at,
        },
        createdAt: org.created_at,
        updatedAt: org.updated_at,
      },
    });
  } catch (err) {
    logger.error('Get organization error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// PUT / — Update organization settings
// ---------------------------------------------------------------------------
router.put('/', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { name, logoUrl, website, customDomain, onboardingState } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (logoUrl !== undefined) { fields.push(`logo_url = $${idx++}`); values.push(logoUrl); }
    if (website !== undefined) { fields.push(`website = $${idx++}`); values.push(website); }
    if (customDomain !== undefined) { fields.push(`custom_domain = $${idx++}`); values.push(customDomain); }
    if (onboardingState !== undefined) { fields.push(`onboarding_state = $${idx++}`); values.push(JSON.stringify(onboardingState)); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.organizationId);

    await db.query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'organization.update',
      targetType: 'organization',
      targetId: req.organizationId,
      description: `Updated organization settings`,
      organizationId: req.organizationId,
    });

    return res.json({ success: true, message: 'Organization updated.' });
  } catch (err) {
    logger.error('Update organization error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /ai-keys — Update org's AI API keys
// ---------------------------------------------------------------------------
router.put('/ai-keys', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { anthropicApiKey, openaiApiKey, geminiApiKey } = req.body;
    const { encrypt } = require('../utils/encryption');

    const fields = [];
    const values = [];
    let idx = 1;

    if (anthropicApiKey !== undefined) {
      fields.push(`anthropic_api_key_enc = $${idx++}`);
      values.push(anthropicApiKey ? encrypt(anthropicApiKey) : null);
    }
    if (openaiApiKey !== undefined) {
      fields.push(`openai_api_key_enc = $${idx++}`);
      values.push(openaiApiKey ? encrypt(openaiApiKey) : null);
    }
    if (geminiApiKey !== undefined) {
      fields.push(`gemini_api_key_enc = $${idx++}`);
      values.push(geminiApiKey ? encrypt(geminiApiKey) : null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No keys provided.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.organizationId);

    await db.query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'organization.update_ai_keys',
      targetType: 'organization',
      targetId: req.organizationId,
      description: `Updated AI API keys`,
      organizationId: req.organizationId,
    });

    return res.json({ success: true, message: 'AI API keys updated.' });
  } catch (err) {
    logger.error('Update AI keys error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// GET /members — List organization members
// ---------------------------------------------------------------------------
router.get('/members', requireOrg, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.full_name, u.is_active, u.last_login_at, u.created_at,
              r.name AS role_name, r.description AS role_description
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.organization_id = $1
       ORDER BY u.created_at ASC`,
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
        role: u.role_name,
        roleDescription: u.role_description,
      })),
    });
  } catch (err) {
    logger.error('List members error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// POST /invite — Invite a new member
// ---------------------------------------------------------------------------
router.post('/invite', requireOrg, requirePermission('*', 'users.invite'), checkUsageLimit('users'), async (req, res) => {
  try {
    const { email, roleId } = req.body;

    if (!email || !roleId) {
      return res.status(400).json({
        success: false,
        message: 'Email and role are required.',
      });
    }

    // Check if user already exists in this org
    const existing = await db.query(
      `SELECT id FROM users WHERE email = $1 AND organization_id = $2`,
      [email.toLowerCase().trim(), req.organizationId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email is already in your organization.',
      });
    }

    // Check for existing pending invitation
    const existingInv = await db.query(
      `SELECT id FROM organization_invitations
       WHERE email = $1 AND organization_id = $2 AND status = 'pending'`,
      [email.toLowerCase().trim(), req.organizationId]
    );
    if (existingInv.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A pending invitation already exists for this email.',
      });
    }

    // Verify the role exists and is not platform_owner or super_admin
    const roleCheck = await db.query(`SELECT name FROM roles WHERE id = $1`, [roleId]);
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }
    if (['platform_owner', 'super_admin'].includes(roleCheck.rows[0].name)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot invite users with platform-level roles.',
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.query(
      `INSERT INTO organization_invitations (organization_id, email, role_id, invited_by, token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.organizationId, email.toLowerCase().trim(), roleId, req.user.id, token, expiresAt]
    );

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'invitation.create',
      targetType: 'invitation',
      description: `Invited ${email} with role ${roleCheck.rows[0].name}`,
      organizationId: req.organizationId,
    });

    return res.status(201).json({
      success: true,
      data: {
        email,
        token,
        expiresAt,
        inviteUrl: `${process.env.FRONTEND_URL || ''}/invite/${token}`,
      },
    });
  } catch (err) {
    logger.error('Invite member error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// GET /invitations — List pending invitations
// ---------------------------------------------------------------------------
router.get('/invitations', requireOrg, requirePermission('*', 'users.invite'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT i.id, i.email, i.status, i.expires_at, i.created_at,
              r.name AS role_name, u.full_name AS invited_by_name
       FROM organization_invitations i
       JOIN roles r ON r.id = i.role_id
       JOIN users u ON u.id = i.invited_by
       WHERE i.organization_id = $1
       ORDER BY i.created_at DESC`,
      [req.organizationId]
    );

    return res.json({
      success: true,
      data: result.rows.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role_name,
        status: i.status,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
        invitedByName: i.invited_by_name,
      })),
    });
  } catch (err) {
    logger.error('List invitations error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /invitations/:id — Revoke a pending invitation
// ---------------------------------------------------------------------------
router.delete('/invitations/:id', requireOrg, requirePermission('*', 'users.invite'), async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE organization_invitations
       SET status = 'revoked'
       WHERE id = $1 AND organization_id = $2 AND status = 'pending'
       RETURNING email`,
      [req.params.id, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pending invitation not found.' });
    }

    return res.json({ success: true, message: 'Invitation revoked.' });
  } catch (err) {
    logger.error('Revoke invitation error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /members/:id/role — Change a member's role
// ---------------------------------------------------------------------------
router.put('/members/:id/role', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { roleId } = req.body;
    const memberId = req.params.id;

    if (!roleId) {
      return res.status(400).json({ success: false, message: 'Role ID is required.' });
    }

    // Verify member belongs to this org
    const member = await db.query(
      `SELECT id, email FROM users WHERE id = $1 AND organization_id = $2`,
      [memberId, req.organizationId]
    );
    if (member.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Member not found in your organization.' });
    }

    // Prevent assigning platform-level roles
    const roleCheck = await db.query(`SELECT name FROM roles WHERE id = $1`, [roleId]);
    if (['platform_owner', 'super_admin'].includes(roleCheck.rows[0]?.name)) {
      return res.status(400).json({ success: false, message: 'Cannot assign platform-level roles.' });
    }

    await db.query(`UPDATE users SET role_id = $1, updated_at = NOW() WHERE id = $2`, [roleId, memberId]);

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'member.role_change',
      targetType: 'user',
      targetId: memberId,
      description: `Changed role for ${member.rows[0].email} to ${roleCheck.rows[0].name}`,
      organizationId: req.organizationId,
    });

    return res.json({ success: true, message: 'Member role updated.' });
  } catch (err) {
    logger.error('Change member role error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /members/:id/deactivate — Deactivate a member
// ---------------------------------------------------------------------------
router.put('/members/:id/deactivate', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const memberId = req.params.id;

    // Can't deactivate yourself
    if (memberId === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
    }

    const result = await db.query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING email`,
      [memberId, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Member not found in your organization.' });
    }

    // Delete their refresh tokens
    await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [memberId]);

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'member.deactivate',
      targetType: 'user',
      targetId: memberId,
      description: `Deactivated member ${result.rows[0].email}`,
      organizationId: req.organizationId,
    });

    return res.json({ success: true, message: 'Member deactivated.' });
  } catch (err) {
    logger.error('Deactivate member error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /members/:id/reactivate — Reactivate a member
// ---------------------------------------------------------------------------
router.put('/members/:id/reactivate', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE users SET is_active = TRUE, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING email`,
      [req.params.id, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Member not found in your organization.' });
    }

    return res.json({ success: true, message: 'Member reactivated.' });
  } catch (err) {
    logger.error('Reactivate member error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// GET /branding — Get white-label branding settings for the current org
// ---------------------------------------------------------------------------
router.get('/branding', requireOrg, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT key, value FROM organization_settings
       WHERE organization_id = $1
         AND key IN ('white_label_logo_url', 'white_label_primary_color', 'white_label_company_name')`,
      [req.organizationId]
    );

    const map = {};
    for (const row of result.rows) {
      map[row.key] = row.value;
    }

    return res.json({
      success: true,
      branding: {
        logoUrl: map['white_label_logo_url'] || null,
        primaryColor: map['white_label_primary_color'] || null,
        companyName: map['white_label_company_name'] || null,
      },
    });
  } catch (err) {
    logger.error('Get branding error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /branding — Save white-label branding settings (admin only)
// ---------------------------------------------------------------------------
router.put('/branding', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { logoUrl, primaryColor, companyName } = req.body;

    const entries = [
      { key: 'white_label_logo_url', value: logoUrl ?? null },
      { key: 'white_label_primary_color', value: primaryColor ?? null },
      { key: 'white_label_company_name', value: companyName ?? null },
    ];

    for (const entry of entries) {
      await db.query(
        `INSERT INTO organization_settings (organization_id, key, value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (organization_id, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [req.organizationId, entry.key, entry.value]
      );
    }

    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'organization.update_branding',
      targetType: 'organization',
      targetId: req.organizationId,
      description: 'Updated white-label branding settings',
      organizationId: req.organizationId,
    });

    return res.json({ success: true, message: 'Branding settings saved.' });
  } catch (err) {
    logger.error('Update branding error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

// ---------------------------------------------------------------------------
// GET /roles — List available roles for invitations
// ---------------------------------------------------------------------------
router.get('/roles', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, description FROM roles
       WHERE name NOT IN ('platform_owner', 'super_admin', 'admin')
       ORDER BY name ASC`
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('List roles error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Internal error.' });
  }
});

module.exports = router;
