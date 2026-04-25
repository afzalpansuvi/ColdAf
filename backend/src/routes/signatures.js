const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const audit = require('../services/audit');

const router = express.Router();

// All signature routes require authentication and tenant scoping
router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a signature DB row to a camelCase response object.
 */
function mapSignature(s) {
  return {
    id: s.id,
    brandId: s.brand_id,
    name: s.name,
    fullName: s.full_name,
    title: s.title,
    phone: s.phone,
    email: s.email,
    website: s.website,
    linkedinUrl: s.linkedin_url,
    twitterUrl: s.twitter_url,
    includeLogo: s.include_logo,
    htmlContent: s.html_content,
    isDefault: s.is_default,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

/**
 * Generates professional HTML email signature from field data.
 * Returns the rendered HTML string.
 */
function generateSignatureHtml({ fullName, title, phone, email, website, linkedinUrl, twitterUrl, includeLogo, logoUrl }) {
  const socialLinks = [];
  if (linkedinUrl) {
    socialLinks.push(`<a href="${escapeHtml(linkedinUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0077b5;text-decoration:none;margin-right:8px;">LinkedIn</a>`);
  }
  if (twitterUrl) {
    socialLinks.push(`<a href="${escapeHtml(twitterUrl)}" target="_blank" rel="noopener noreferrer" style="color:#1da1f2;text-decoration:none;margin-right:8px;">Twitter</a>`);
  }

  const rows = [];

  if (fullName) {
    rows.push(`<tr><td style="font-size:16px;font-weight:bold;color:#333333;padding-bottom:2px;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(fullName)}</td></tr>`);
  }
  if (title) {
    rows.push(`<tr><td style="font-size:13px;color:#666666;padding-bottom:8px;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(title)}</td></tr>`);
  }

  // Separator
  rows.push(`<tr><td style="border-bottom:2px solid #0066cc;padding-bottom:8px;margin-bottom:8px;"></td></tr>`);

  const contactParts = [];
  if (phone) {
    contactParts.push(`<span style="color:#333333;">${escapeHtml(phone)}</span>`);
  }
  if (email) {
    contactParts.push(`<a href="mailto:${escapeHtml(email)}" style="color:#0066cc;text-decoration:none;">${escapeHtml(email)}</a>`);
  }
  if (contactParts.length > 0) {
    rows.push(`<tr><td style="font-size:12px;padding-top:8px;font-family:Arial,Helvetica,sans-serif;">${contactParts.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</td></tr>`);
  }

  if (website) {
    rows.push(`<tr><td style="font-size:12px;padding-top:4px;font-family:Arial,Helvetica,sans-serif;"><a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" style="color:#0066cc;text-decoration:none;">${escapeHtml(website)}</a></td></tr>`);
  }

  if (socialLinks.length > 0) {
    rows.push(`<tr><td style="font-size:12px;padding-top:8px;font-family:Arial,Helvetica,sans-serif;">${socialLinks.join('')}</td></tr>`);
  }

  let logoHtml = '';
  if (includeLogo && logoUrl) {
    logoHtml = `<td style="vertical-align:top;padding-right:16px;"><img src="${escapeHtml(logoUrl)}" alt="Logo" style="width:60px;height:auto;border:0;" /></td>`;
  }

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;max-width:500px;">
  <tr>
    ${logoHtml}
    <td style="vertical-align:top;">
      <table cellpadding="0" cellspacing="0" border="0">
        ${rows.join('\n        ')}
      </table>
    </td>
  </tr>
</table>`;
}

/**
 * Basic HTML entity escaping for user-supplied values.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// GET / - List signatures, optional filter by brand_id
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { brand_id } = req.query;

    let sql = `
      SELECT s.*, b.name AS brand_name, b.logo_url AS brand_logo_url
      FROM email_signatures s
      LEFT JOIN brands b ON b.id = s.brand_id
      WHERE s.organization_id = $1
    `;
    const params = [req.organizationId];

    if (brand_id) {
      sql += ` AND s.brand_id = $2`;
      params.push(brand_id);
    }

    sql += ` ORDER BY s.is_default DESC, s.name ASC`;

    const result = await db.query(sql, params);

    return res.json({
      success: true,
      data: result.rows.map((s) => ({
        ...mapSignature(s),
        brandName: s.brand_name || null,
      })),
    });
  } catch (err) {
    logger.error('List signatures error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing signatures.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /:id - Get single signature
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT s.*, b.name AS brand_name, b.logo_url AS brand_logo_url
       FROM email_signatures s
       LEFT JOIN brands b ON b.id = s.brand_id
       WHERE s.id = $1 AND s.organization_id = $2`,
      [id, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Signature not found.',
      });
    }

    const s = result.rows[0];

    return res.json({
      success: true,
      data: {
        ...mapSignature(s),
        brandName: s.brand_name || null,
      },
    });
  } catch (err) {
    logger.error('Get signature error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the signature.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST / - Create signature (requires templates.manage permission)
// ---------------------------------------------------------------------------
router.post('/', requirePermission('templates.manage'), async (req, res) => {
  try {
    const {
      brandId,
      name,
      fullName,
      title,
      phone,
      email,
      website,
      linkedinUrl,
      twitterUrl,
      includeLogo,
      htmlContent,
      isDefault,
    } = req.body;

    // Validation
    if (!brandId) {
      return res.status(400).json({
        success: false,
        message: 'Brand ID is required.',
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Signature name is required.',
      });
    }

    // Validate brand exists within this organization
    const brandCheck = await db.query(
      `SELECT id FROM brands WHERE id = $1 AND organization_id = $2`,
      [brandId, req.organizationId]
    );
    if (brandCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The specified brand does not exist.',
      });
    }

    // Use a client for transaction if isDefault to ensure atomicity
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // If setting as default, unset all other defaults for this brand within this organization
      if (isDefault) {
        await client.query(
          `UPDATE email_signatures SET is_default = false, updated_at = NOW()
           WHERE brand_id = $1 AND is_default = true AND organization_id = $2`,
          [brandId, req.organizationId]
        );
      }

      const result = await client.query(
        `INSERT INTO email_signatures
          (brand_id, name, full_name, title, phone, email, website,
           linkedin_url, twitter_url, include_logo, html_content, is_default,
           organization_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          brandId,
          name.trim(),
          fullName || null,
          title || null,
          phone || null,
          email || null,
          website || null,
          linkedinUrl || null,
          twitterUrl || null,
          includeLogo != null ? includeLogo : true,
          htmlContent || null,
          isDefault || false,
          req.organizationId,
        ]
      );

      // If this is the default signature, update the brand's default_signature_id
      if (isDefault) {
        await client.query(
          `UPDATE brands SET default_signature_id = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
          [result.rows[0].id, brandId, req.organizationId]
        );
      }

      await client.query('COMMIT');

      const signature = result.rows[0];

      // Audit log
      await audit.logAction({
        actorId: req.user.id,
        actorName: req.user.email,
        actionType: 'signature.create',
        targetType: 'email_signature',
        targetId: signature.id,
        description: `Created email signature "${signature.name}" for brand ${brandId}`,
        metadata: { signatureName: signature.name, brandId, isDefault: signature.is_default },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      logger.info('Signature created', { signatureId: signature.id, name: signature.name, createdBy: req.user.id });

      return res.status(201).json({
        success: true,
        data: mapSignature(signature),
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Create signature error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the signature.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id - Update signature (requires templates.manage permission)
// ---------------------------------------------------------------------------
router.put('/:id', requirePermission('templates.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      brandId,
      name,
      fullName,
      title,
      phone,
      email,
      website,
      linkedinUrl,
      twitterUrl,
      includeLogo,
      htmlContent,
      isDefault,
    } = req.body;

    // Verify signature exists within this organization
    const sigCheck = await db.query(
      `SELECT id, name, brand_id FROM email_signatures WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (sigCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Signature not found.',
      });
    }

    const existingSignature = sigCheck.rows[0];
    const effectiveBrandId = brandId !== undefined ? brandId : existingSignature.brand_id;

    // Validate brand if changed (within this organization)
    if (brandId !== undefined && brandId !== existingSignature.brand_id) {
      const brandCheck = await db.query(
        `SELECT id FROM brands WHERE id = $1 AND organization_id = $2`,
        [brandId, req.organizationId]
      );
      if (brandCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'The specified brand does not exist.',
        });
      }
    }

    // Build dynamic SET clause
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    if (brandId !== undefined) {
      setClauses.push(`brand_id = $${paramIndex++}`);
      params.push(brandId);
    }

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Signature name cannot be empty.',
        });
      }
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    if (fullName !== undefined) {
      setClauses.push(`full_name = $${paramIndex++}`);
      params.push(fullName);
    }

    if (title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      params.push(title);
    }

    if (phone !== undefined) {
      setClauses.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }

    if (email !== undefined) {
      setClauses.push(`email = $${paramIndex++}`);
      params.push(email);
    }

    if (website !== undefined) {
      setClauses.push(`website = $${paramIndex++}`);
      params.push(website);
    }

    if (linkedinUrl !== undefined) {
      setClauses.push(`linkedin_url = $${paramIndex++}`);
      params.push(linkedinUrl);
    }

    if (twitterUrl !== undefined) {
      setClauses.push(`twitter_url = $${paramIndex++}`);
      params.push(twitterUrl);
    }

    if (includeLogo !== undefined) {
      setClauses.push(`include_logo = $${paramIndex++}`);
      params.push(includeLogo);
    }

    if (htmlContent !== undefined) {
      setClauses.push(`html_content = $${paramIndex++}`);
      params.push(htmlContent);
    }

    if (isDefault !== undefined) {
      setClauses.push(`is_default = $${paramIndex++}`);
      params.push(isDefault);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update.',
      });
    }

    setClauses.push(`updated_at = NOW()`);

    params.push(id);
    const idPlaceholder = `$${paramIndex}`;

    // Use a transaction if isDefault changed to true
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // If setting as default, unset all other defaults for the same brand within this organization
      if (isDefault === true) {
        await client.query(
          `UPDATE email_signatures SET is_default = false, updated_at = NOW()
           WHERE brand_id = $1 AND id != $2 AND is_default = true AND organization_id = $3`,
          [effectiveBrandId, id, req.organizationId]
        );
      }

      params.push(req.organizationId);
      const orgPlaceholder = `$${++paramIndex}`;

      const updateResult = await client.query(
        `UPDATE email_signatures
         SET ${setClauses.join(', ')}
         WHERE id = ${idPlaceholder} AND organization_id = ${orgPlaceholder}
         RETURNING *`,
        params
      );

      const signature = updateResult.rows[0];

      // Update brand's default_signature_id if this is now the default
      if (isDefault === true) {
        await client.query(
          `UPDATE brands SET default_signature_id = $1, updated_at = NOW() WHERE id = $2`,
          [id, effectiveBrandId]
        );
      } else if (isDefault === false) {
        // If we're unsetting default, clear brand's default_signature_id if it pointed to this signature
        await client.query(
          `UPDATE brands SET default_signature_id = NULL, updated_at = NOW()
           WHERE id = $1 AND default_signature_id = $2`,
          [effectiveBrandId, id]
        );
      }

      await client.query('COMMIT');

      // Audit log
      await audit.logAction({
        actorId: req.user.id,
        actorName: req.user.email,
        actionType: 'signature.update',
        targetType: 'email_signature',
        targetId: id,
        description: `Updated email signature "${existingSignature.name}"`,
        metadata: { updatedFields: Object.keys(req.body) },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      logger.info('Signature updated', { signatureId: id, updatedBy: req.user.id });

      return res.json({
        success: true,
        data: mapSignature(signature),
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Update signature error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the signature.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - Delete signature (requires templates.manage permission)
// ---------------------------------------------------------------------------
router.delete('/:id', requirePermission('templates.manage'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify signature exists within this organization
    const sigCheck = await db.query(
      `SELECT id, name, brand_id, is_default FROM email_signatures WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (sigCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Signature not found.',
      });
    }

    const signature = sigCheck.rows[0];

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // If this was the brand's default signature, clear it
      if (signature.is_default) {
        await client.query(
          `UPDATE brands SET default_signature_id = NULL, updated_at = NOW()
           WHERE id = $1 AND default_signature_id = $2 AND organization_id = $3`,
          [signature.brand_id, id, req.organizationId]
        );
      }

      await client.query(`DELETE FROM email_signatures WHERE id = $1 AND organization_id = $2`, [id, req.organizationId]);

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'signature.delete',
      targetType: 'email_signature',
      targetId: id,
      description: `Deleted email signature "${signature.name}"`,
      metadata: { signatureName: signature.name, brandId: signature.brand_id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Signature deleted', { signatureId: id, deletedBy: req.user.id });

    return res.json({
      success: true,
      message: `Signature "${signature.name}" has been deleted.`,
    });
  } catch (err) {
    logger.error('Delete signature error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deleting the signature.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /generate-html - Generate HTML signature preview (does not save)
// ---------------------------------------------------------------------------
router.post('/generate-html', requirePermission('templates.manage'), async (req, res) => {
  try {
    const {
      brandId,
      fullName,
      title,
      phone,
      email,
      website,
      linkedinUrl,
      twitterUrl,
      includeLogo,
    } = req.body;

    if (!fullName && !email) {
      return res.status(400).json({
        success: false,
        message: 'At least a full name or email is required to generate a signature.',
      });
    }

    // Look up brand logo if includeLogo and brandId provided
    let logoUrl = null;
    if (includeLogo !== false && brandId) {
      const brandResult = await db.query(
        `SELECT logo_url FROM brands WHERE id = $1 AND organization_id = $2`,
        [brandId, req.organizationId]
      );
      if (brandResult.rows.length > 0 && brandResult.rows[0].logo_url) {
        logoUrl = brandResult.rows[0].logo_url;
      }
    }

    const html = generateSignatureHtml({
      fullName,
      title,
      phone,
      email,
      website,
      linkedinUrl,
      twitterUrl,
      includeLogo: includeLogo !== false,
      logoUrl,
    });

    return res.json({
      success: true,
      data: {
        html,
      },
    });
  } catch (err) {
    logger.error('Generate signature HTML error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while generating the signature HTML.',
    });
  }
});

module.exports = router;
