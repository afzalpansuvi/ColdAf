const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/database');
const env = require('../config/env');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const audit = require('../services/audit');

const router = express.Router();

// All brand routes require authentication and tenant scoping
router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// Multer configuration for logo uploads
// ---------------------------------------------------------------------------
const uploadsDir = path.resolve(env.uploadDir, 'logos');

// Ensure the logos upload directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename(_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `brand-logo-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ---------------------------------------------------------------------------
// GET / - List all brands
// Active brands for sales users, all brands for admins
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    let sql = `
      SELECT id, name, logo_url, primary_domain, office_address, website_url,
             ai_system_prompt, booking_link, daily_send_limit,
             send_window_start, send_window_end, send_days,
             min_delay_minutes, max_delay_minutes, ai_model,
             is_active, created_at, updated_at
      FROM brands
      WHERE organization_id = $1
    `;

    if (!isAdmin) {
      sql += ` AND is_active = TRUE`;
    }

    sql += ` ORDER BY name ASC`;

    const result = await db.query(sql, [req.organizationId]);

    return res.json({
      success: true,
      data: result.rows.map((b) => ({
        id: b.id,
        name: b.name,
        logoUrl: b.logo_url,
        primaryDomain: b.primary_domain,
        officeAddress: b.office_address,
        websiteUrl: b.website_url,
        aiSystemPrompt: b.ai_system_prompt,
        bookingLink: b.booking_link,
        dailySendLimit: b.daily_send_limit,
        sendWindowStart: b.send_window_start,
        sendWindowEnd: b.send_window_end,
        sendDays: b.send_days,
        minDelayMinutes: b.min_delay_minutes,
        maxDelayMinutes: b.max_delay_minutes,
        aiModel: b.ai_model,
        isActive: b.is_active,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      })),
    });
  } catch (err) {
    logger.error('List brands error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing brands.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /:id - Get brand by ID with associated SMTP accounts count
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT b.id, b.name, b.logo_url, b.primary_domain, b.office_address,
              b.website_url, b.ai_system_prompt, b.booking_link,
              b.daily_send_limit, b.send_window_start, b.send_window_end,
              b.send_days, b.min_delay_minutes, b.max_delay_minutes,
              b.ai_model, b.is_active, b.created_at, b.updated_at,
              COUNT(sa.id)::int AS smtp_accounts_count
       FROM brands b
       LEFT JOIN smtp_accounts sa ON sa.brand_id = b.id AND sa.is_active = TRUE
       WHERE b.id = $1 AND b.organization_id = $2
       GROUP BY b.id`,
      [id, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found.',
      });
    }

    const b = result.rows[0];

    return res.json({
      success: true,
      data: {
        id: b.id,
        name: b.name,
        logoUrl: b.logo_url,
        primaryDomain: b.primary_domain,
        officeAddress: b.office_address,
        websiteUrl: b.website_url,
        aiSystemPrompt: b.ai_system_prompt,
        bookingLink: b.booking_link,
        dailySendLimit: b.daily_send_limit,
        sendWindowStart: b.send_window_start,
        sendWindowEnd: b.send_window_end,
        sendDays: b.send_days,
        minDelayMinutes: b.min_delay_minutes,
        maxDelayMinutes: b.max_delay_minutes,
        aiModel: b.ai_model,
        isActive: b.is_active,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
        smtpAccountsCount: b.smtp_accounts_count,
      },
    });
  } catch (err) {
    logger.error('Get brand error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the brand.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST / - Create a new brand (admin only)
// ---------------------------------------------------------------------------
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const {
      name,
      primaryDomain,
      officeAddress,
      websiteUrl,
      aiSystemPrompt,
      bookingLink,
      dailySendLimit,
      sendWindowStart,
      sendWindowEnd,
      sendDays,
      minDelayMinutes,
      maxDelayMinutes,
      aiModel,
      isActive,
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Brand name is required.',
      });
    }

    // Check for duplicate name within this organization
    const existing = await db.query(
      `SELECT id FROM brands WHERE LOWER(name) = LOWER($1) AND organization_id = $2`,
      [name.trim(), req.organizationId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A brand with this name already exists.',
      });
    }

    const result = await db.query(
      `INSERT INTO brands
        (name, primary_domain, office_address, website_url, ai_system_prompt,
         booking_link, daily_send_limit, send_window_start, send_window_end,
         send_days, min_delay_minutes, max_delay_minutes, ai_model, is_active,
         organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        name.trim(),
        primaryDomain || null,
        officeAddress || null,
        websiteUrl || null,
        aiSystemPrompt || null,
        bookingLink || null,
        dailySendLimit != null ? dailySendLimit : 100,
        sendWindowStart || '09:00',
        sendWindowEnd || '17:00',
        sendDays || [1, 2, 3, 4, 5],
        minDelayMinutes != null ? minDelayMinutes : 2,
        maxDelayMinutes != null ? maxDelayMinutes : 5,
        aiModel || 'claude-sonnet-4-20250514',
        isActive != null ? isActive : true,
        req.organizationId,
      ]
    );

    const brand = result.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'brand.create',
      targetType: 'brand',
      targetId: brand.id,
      description: `Admin created brand "${brand.name}"`,
      metadata: { brandName: brand.name, primaryDomain: brand.primary_domain },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Brand created', { brandId: brand.id, name: brand.name, createdBy: req.user.id });

    return res.status(201).json({
      success: true,
      data: {
        id: brand.id,
        name: brand.name,
        logoUrl: brand.logo_url,
        primaryDomain: brand.primary_domain,
        officeAddress: brand.office_address,
        websiteUrl: brand.website_url,
        aiSystemPrompt: brand.ai_system_prompt,
        bookingLink: brand.booking_link,
        dailySendLimit: brand.daily_send_limit,
        sendWindowStart: brand.send_window_start,
        sendWindowEnd: brand.send_window_end,
        sendDays: brand.send_days,
        minDelayMinutes: brand.min_delay_minutes,
        maxDelayMinutes: brand.max_delay_minutes,
        aiModel: brand.ai_model,
        isActive: brand.is_active,
        createdAt: brand.created_at,
        updatedAt: brand.updated_at,
      },
    });
  } catch (err) {
    logger.error('Create brand error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the brand.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id - Update a brand (admin only)
// ---------------------------------------------------------------------------
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      primaryDomain,
      officeAddress,
      websiteUrl,
      aiSystemPrompt,
      bookingLink,
      dailySendLimit,
      sendWindowStart,
      sendWindowEnd,
      sendDays,
      minDelayMinutes,
      maxDelayMinutes,
      aiModel,
      isActive,
    } = req.body;

    // Verify brand exists within this organization
    const brandCheck = await db.query(`SELECT id, name FROM brands WHERE id = $1 AND organization_id = $2`, [id, req.organizationId]);
    if (brandCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found.',
      });
    }

    const existingBrand = brandCheck.rows[0];

    // Build dynamic SET clause
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      // Check for duplicate name (exclude current brand) within this organization
      const duplicate = await db.query(
        `SELECT id FROM brands WHERE LOWER(name) = LOWER($1) AND id != $2 AND organization_id = $3`,
        [name.trim(), id, req.organizationId]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'A brand with this name already exists.',
        });
      }
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    if (primaryDomain !== undefined) {
      setClauses.push(`primary_domain = $${paramIndex++}`);
      params.push(primaryDomain);
    }

    if (officeAddress !== undefined) {
      setClauses.push(`office_address = $${paramIndex++}`);
      params.push(officeAddress);
    }

    if (websiteUrl !== undefined) {
      setClauses.push(`website_url = $${paramIndex++}`);
      params.push(websiteUrl);
    }

    if (aiSystemPrompt !== undefined) {
      setClauses.push(`ai_system_prompt = $${paramIndex++}`);
      params.push(aiSystemPrompt);
    }

    if (bookingLink !== undefined) {
      setClauses.push(`booking_link = $${paramIndex++}`);
      params.push(bookingLink);
    }

    if (dailySendLimit !== undefined) {
      setClauses.push(`daily_send_limit = $${paramIndex++}`);
      params.push(dailySendLimit);
    }

    if (sendWindowStart !== undefined) {
      setClauses.push(`send_window_start = $${paramIndex++}`);
      params.push(sendWindowStart);
    }

    if (sendWindowEnd !== undefined) {
      setClauses.push(`send_window_end = $${paramIndex++}`);
      params.push(sendWindowEnd);
    }

    if (sendDays !== undefined) {
      setClauses.push(`send_days = $${paramIndex++}`);
      params.push(sendDays);
    }

    if (minDelayMinutes !== undefined) {
      setClauses.push(`min_delay_minutes = $${paramIndex++}`);
      params.push(minDelayMinutes);
    }

    if (maxDelayMinutes !== undefined) {
      setClauses.push(`max_delay_minutes = $${paramIndex++}`);
      params.push(maxDelayMinutes);
    }

    if (aiModel !== undefined) {
      setClauses.push(`ai_model = $${paramIndex++}`);
      params.push(aiModel);
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

    params.push(id);
    const idPlaceholder = `$${paramIndex++}`;
    params.push(req.organizationId);
    const orgPlaceholder = `$${paramIndex}`;

    const updateResult = await db.query(
      `UPDATE brands
       SET ${setClauses.join(', ')}
       WHERE id = ${idPlaceholder} AND organization_id = ${orgPlaceholder}
       RETURNING *`,
      params
    );

    const brand = updateResult.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'brand.update',
      targetType: 'brand',
      targetId: id,
      description: `Admin updated brand "${existingBrand.name}"`,
      metadata: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Brand updated', { brandId: id, updatedBy: req.user.id });

    return res.json({
      success: true,
      data: {
        id: brand.id,
        name: brand.name,
        logoUrl: brand.logo_url,
        primaryDomain: brand.primary_domain,
        officeAddress: brand.office_address,
        websiteUrl: brand.website_url,
        aiSystemPrompt: brand.ai_system_prompt,
        bookingLink: brand.booking_link,
        dailySendLimit: brand.daily_send_limit,
        sendWindowStart: brand.send_window_start,
        sendWindowEnd: brand.send_window_end,
        sendDays: brand.send_days,
        minDelayMinutes: brand.min_delay_minutes,
        maxDelayMinutes: brand.max_delay_minutes,
        aiModel: brand.ai_model,
        isActive: brand.is_active,
        createdAt: brand.created_at,
        updatedAt: brand.updated_at,
      },
    });
  } catch (err) {
    logger.error('Update brand error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the brand.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/logo - Upload brand logo (admin only)
// ---------------------------------------------------------------------------
router.post('/:id/logo', requireRole('admin'), (req, res, next) => {
  upload.single('logo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds the 5 MB limit.',
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No logo file provided. Upload a file with the field name "logo".',
      });
    }

    // Verify brand exists within this organization
    const brandCheck = await db.query(`SELECT id, name, logo_url FROM brands WHERE id = $1 AND organization_id = $2`, [id, req.organizationId]);
    if (brandCheck.rows.length === 0) {
      // Clean up uploaded file since the brand doesn't exist
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({
        success: false,
        message: 'Brand not found.',
      });
    }

    const existingBrand = brandCheck.rows[0];

    // Delete old logo file if one exists
    if (existingBrand.logo_url) {
      const oldPath = path.resolve(existingBrand.logo_url);
      fs.unlink(oldPath, (unlinkErr) => {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          logger.warn('Failed to delete old brand logo', { path: oldPath, error: unlinkErr.message });
        }
      });
    }

    // Store relative path for portability
    const logoPath = path.join('uploads', 'logos', req.file.filename);

    await db.query(
      `UPDATE brands SET logo_url = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
      [logoPath, id, req.organizationId]
    );

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'brand.logo_upload',
      targetType: 'brand',
      targetId: id,
      description: `Admin uploaded logo for brand "${existingBrand.name}"`,
      metadata: { filename: req.file.filename, size: req.file.size },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Brand logo uploaded', { brandId: id, filename: req.file.filename });

    return res.json({
      success: true,
      data: {
        logoUrl: logoPath,
      },
    });
  } catch (err) {
    logger.error('Upload brand logo error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while uploading the logo.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - Soft deactivate a brand (admin only)
// ---------------------------------------------------------------------------
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify brand exists within this organization
    const brandCheck = await db.query(
      `SELECT id, name, is_active FROM brands WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (brandCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found.',
      });
    }

    const brand = brandCheck.rows[0];

    if (!brand.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Brand is already deactivated.',
      });
    }

    // Soft deactivate
    await db.query(
      `UPDATE brands SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'brand.deactivate',
      targetType: 'brand',
      targetId: id,
      description: `Admin deactivated brand "${brand.name}"`,
      metadata: { brandName: brand.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Brand deactivated', { brandId: id, deactivatedBy: req.user.id });

    return res.json({
      success: true,
      message: `Brand "${brand.name}" has been deactivated.`,
    });
  } catch (err) {
    logger.error('Deactivate brand error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deactivating the brand.',
    });
  }
});

module.exports = router;
