const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const audit = require('../services/audit');

const router = express.Router();

// All template routes require authentication and tenant scoping
router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = [
  'cold_outreach',
  'follow_up',
  're_engagement',
  'introduction',
  'meeting_request',
  'thank_you',
  'custom',
];

/**
 * Maps a template DB row to a camelCase response object.
 */
function mapTemplate(t) {
  return {
    id: t.id,
    brandId: t.brand_id,
    name: t.name,
    subject: t.subject,
    bodyHtml: t.body_html,
    bodyText: t.body_text,
    category: t.category,
    tags: t.tags,
    isAiGenerated: t.is_ai_generated,
    useSpintax: t.use_spintax,
    createdBy: t.created_by,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET / - List templates with optional filters
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { brand_id, category, search, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Always filter by organization
    conditions.push(`t.organization_id = $${paramIndex++}`);
    params.push(req.organizationId);

    if (brand_id) {
      conditions.push(`t.brand_id = $${paramIndex++}`);
      params.push(brand_id);
    }

    if (category) {
      conditions.push(`t.category = $${paramIndex++}`);
      params.push(category);
    }

    if (search) {
      conditions.push(`(t.name ILIKE $${paramIndex} OR t.subject ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Count total for pagination
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM email_templates t ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * pageSize;

    const dataParams = [...params, pageSize, offset];

    const result = await db.query(
      `SELECT t.*, u.full_name AS creator_name
       FROM email_templates t
       LEFT JOIN users u ON u.id = t.created_by
       ${whereClause}
       ORDER BY t.updated_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      dataParams
    );

    return res.json({
      success: true,
      data: result.rows.map((t) => ({
        ...mapTemplate(t),
        creatorName: t.creator_name || null,
      })),
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    logger.error('List templates error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing templates.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /spam-check - Analyse email content for spam signals (must be before /:id)
// ---------------------------------------------------------------------------
router.post('/spam-check', async (req, res) => {
  try {
    const { subject = '', bodyText = '', bodyHtml = '' } = req.body;

    const text = bodyText || bodyHtml.replace(/<[^>]+>/g, ' ');
    const fullContent = `${subject}\n\n${text}`;

    const flags = [];
    let score = 0;

    // Rule set (SpamAssassin-inspired)
    const rules = [
      { id: 'SUBJECT_ALL_CAPS', test: () => subject === subject.toUpperCase() && subject.length > 5 && /[A-Z]/.test(subject), score: 1.5, desc: 'Subject line is ALL CAPS' },
      { id: 'SUBJECT_EXCLAMATION', test: () => (subject.match(/!/g) || []).length > 1, score: 0.5, desc: 'Multiple exclamation marks in subject' },
      { id: 'SPAM_WORDS_SUBJECT', test: () => /\b(free|guaranteed|winner|cash|prize|urgent|act now|limited time|click here|buy now|order now|earn money|make money|no cost|100%|risk.?free)\b/i.test(subject), score: 2.0, desc: 'Spam trigger words in subject line' },
      { id: 'SPAM_WORDS_BODY', test: () => /\b(free|guaranteed|winner|cash|prize|earn \$|make \$|no cost|risk.?free|click here|buy now|order now|unsubscribe now|lose weight|earn extra|work from home|extra income|double your)\b/i.test(text), score: 1.0, desc: 'Spam trigger words in email body' },
      { id: 'EXCESSIVE_LINKS', test: () => (bodyHtml.match(/<a /gi) || []).length > 5, score: 1.0, desc: 'Too many links (more than 5)' },
      { id: 'NO_UNSUBSCRIBE', test: () => !/unsubscribe/i.test(fullContent), score: 1.5, desc: 'Missing unsubscribe link' },
      { id: 'DOLLAR_SIGN', test: () => (text.match(/\$/g) || []).length > 2, score: 0.5, desc: 'Multiple dollar signs' },
      { id: 'ALL_CAPS_WORDS', test: () => (text.match(/\b[A-Z]{4,}\b/g) || []).length > 3, score: 0.5, desc: 'Multiple ALL-CAPS words in body' },
      { id: 'EXCESSIVE_EXCLAMATION', test: () => (fullContent.match(/!/g) || []).length > 3, score: 0.5, desc: 'Too many exclamation marks' },
      { id: 'HTML_IMAGE_ONLY', test: () => bodyHtml.length > 100 && text.replace(/\s/g, '').length < 50, score: 2.0, desc: 'Email is mostly images with little text' },
      { id: 'SHORT_BODY', test: () => text.trim().split(/\s+/).length < 20, score: 0.3, desc: 'Very short email body' },
      { id: 'PERCENTAGE_NUMBERS', test: () => /\b\d{2,3}%\b/.test(text) && /\b(off|discount|save|return|profit)\b/i.test(text), score: 0.5, desc: 'Percentage-based offers detected' },
    ];

    for (const rule of rules) {
      try {
        if (rule.test()) {
          flags.push({ id: rule.id, description: rule.desc, score: rule.score });
          score += rule.score;
        }
      } catch (e) { /* skip broken rule */ }
    }

    // Cap score at 10
    score = Math.min(Math.round(score * 10) / 10, 10);

    const level = score <= 2 ? 'good' : score <= 4 ? 'warning' : 'danger';

    res.json({ success: true, score, level, flags });
  } catch (err) {
    console.error('Spam check error:', err);
    res.status(500).json({ success: false, message: 'Spam check failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /preview - Return CSS-inlined HTML for email client preview (before /:id)
// ---------------------------------------------------------------------------
router.post('/preview', async (req, res) => {
  try {
    const { subject = '', bodyHtml = '', bodyText = '' } = req.body;
    // Simple CSS inlining: wrap content in a standard email-safe container
    const html = bodyHtml || `<p style="font-family:sans-serif;font-size:14px;line-height:1.6;">${bodyText.replace(/\n/g, '<br>')}</p>`;
    const inlined = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><tr><td style="padding:32px 40px;font-size:14px;line-height:1.7;color:#333333;">${html}</td></tr></table></td></tr></table></body></html>`;
    res.json({ success: true, html: inlined, subject });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Preview generation failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id - Get single template
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT t.*, u.full_name AS creator_name
       FROM email_templates t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.id = $1 AND t.organization_id = $2`,
      [id, req.organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found.',
      });
    }

    const t = result.rows[0];

    return res.json({
      success: true,
      data: {
        ...mapTemplate(t),
        creatorName: t.creator_name || null,
      },
    });
  } catch (err) {
    logger.error('Get template error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the template.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST / - Create template (requires templates.manage permission)
// ---------------------------------------------------------------------------
router.post('/', requirePermission('templates.manage'), async (req, res) => {
  try {
    const {
      brandId,
      name,
      subject,
      bodyHtml,
      bodyText,
      category,
      tags,
      useSpintax,
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Template name is required.',
      });
    }

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    // Validate brand exists within this organization if provided
    if (brandId) {
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

    const result = await db.query(
      `INSERT INTO email_templates
        (brand_id, name, subject, body_html, body_text, category, tags, use_spintax, created_by,
         organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        brandId || null,
        name.trim(),
        subject || null,
        bodyHtml || null,
        bodyText || null,
        category || 'cold_outreach',
        tags || [],
        useSpintax || false,
        req.user.id,
        req.organizationId,
      ]
    );

    const template = result.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'template.create',
      targetType: 'email_template',
      targetId: template.id,
      description: `Created email template "${template.name}"`,
      metadata: { templateName: template.name, category: template.category, brandId: template.brand_id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Template created', { templateId: template.id, name: template.name, createdBy: req.user.id });

    return res.status(201).json({
      success: true,
      data: mapTemplate(template),
    });
  } catch (err) {
    logger.error('Create template error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the template.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id - Update template (requires templates.manage permission)
// ---------------------------------------------------------------------------
router.put('/:id', requirePermission('templates.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      brandId,
      name,
      subject,
      bodyHtml,
      bodyText,
      category,
      tags,
      useSpintax,
    } = req.body;

    // Verify template exists within this organization
    const templateCheck = await db.query(
      `SELECT id, name FROM email_templates WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );
    if (templateCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found.',
      });
    }

    const existingTemplate = templateCheck.rows[0];

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    // Validate brand exists within this organization if provided
    if (brandId) {
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
      params.push(brandId || null);
    }

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Template name cannot be empty.',
        });
      }
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    if (subject !== undefined) {
      setClauses.push(`subject = $${paramIndex++}`);
      params.push(subject);
    }

    if (bodyHtml !== undefined) {
      setClauses.push(`body_html = $${paramIndex++}`);
      params.push(bodyHtml);
    }

    if (bodyText !== undefined) {
      setClauses.push(`body_text = $${paramIndex++}`);
      params.push(bodyText);
    }

    if (category !== undefined) {
      setClauses.push(`category = $${paramIndex++}`);
      params.push(category);
    }

    if (tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      params.push(tags);
    }

    if (useSpintax !== undefined) {
      setClauses.push(`use_spintax = $${paramIndex++}`);
      params.push(useSpintax);
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
      `UPDATE email_templates
       SET ${setClauses.join(', ')}
       WHERE id = ${idPlaceholder} AND organization_id = ${orgPlaceholder}
       RETURNING *`,
      params
    );

    const template = updateResult.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'template.update',
      targetType: 'email_template',
      targetId: id,
      description: `Updated email template "${existingTemplate.name}"`,
      metadata: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Template updated', { templateId: id, updatedBy: req.user.id });

    return res.json({
      success: true,
      data: mapTemplate(template),
    });
  } catch (err) {
    logger.error('Update template error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the template.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - Delete template (requires templates.manage permission)
// ---------------------------------------------------------------------------
router.delete('/:id', requirePermission('templates.manage'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify template exists within this organization
    const templateCheck = await db.query(
      `SELECT id, name FROM email_templates WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (templateCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found.',
      });
    }

    const template = templateCheck.rows[0];

    // Check if template is in use by any active sequence steps
    const usageCheck = await db.query(
      `SELECT COUNT(*)::int AS usage_count
       FROM sequence_steps ss
       JOIN campaigns c ON c.id = ss.campaign_id
       WHERE ss.template_id = $1
         AND c.status IN ('active', 'scheduled')`,
      [id]
    );

    if (usageCheck.rows[0].usage_count > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete template "${template.name}" because it is used in ${usageCheck.rows[0].usage_count} active campaign sequence(s). Remove the template from those sequences first.`,
      });
    }

    await db.query(`DELETE FROM email_templates WHERE id = $1 AND organization_id = $2`, [id, req.organizationId]);

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'template.delete',
      targetType: 'email_template',
      targetId: id,
      description: `Deleted email template "${template.name}"`,
      metadata: { templateName: template.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Template deleted', { templateId: id, deletedBy: req.user.id });

    return res.json({
      success: true,
      message: `Template "${template.name}" has been deleted.`,
    });
  } catch (err) {
    logger.error('Delete template error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deleting the template.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /:id/duplicate - Duplicate a template (requires templates.manage)
// ---------------------------------------------------------------------------
router.post('/:id/duplicate', requirePermission('templates.manage'), async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the source template within this organization
    const sourceResult = await db.query(
      `SELECT * FROM email_templates WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (sourceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found.',
      });
    }

    const source = sourceResult.rows[0];

    // Generate a unique name for the duplicate
    let duplicateName = `${source.name} (Copy)`;

    // Check for name collisions and increment if needed (within org)
    const existingCopies = await db.query(
      `SELECT name FROM email_templates
       WHERE name LIKE $1 AND organization_id = $2
       ORDER BY name DESC
       LIMIT 1`,
      [`${source.name} (Copy%`, req.organizationId]
    );

    if (existingCopies.rows.length > 0) {
      // Extract the number from the last copy name, e.g. "Template (Copy 2)" -> 2
      const lastCopyName = existingCopies.rows[0].name;
      const match = lastCopyName.match(/\(Copy\s*(\d*)\)$/);
      if (match) {
        const num = match[1] ? parseInt(match[1], 10) : 1;
        duplicateName = `${source.name} (Copy ${num + 1})`;
      }
    }

    const result = await db.query(
      `INSERT INTO email_templates
        (brand_id, name, subject, body_html, body_text, category, tags, is_ai_generated, use_spintax, created_by,
         organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        source.brand_id,
        duplicateName,
        source.subject,
        source.body_html,
        source.body_text,
        source.category,
        source.tags,
        source.is_ai_generated,
        source.use_spintax,
        req.user.id,
        req.organizationId,
      ]
    );

    const duplicate = result.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'template.duplicate',
      targetType: 'email_template',
      targetId: duplicate.id,
      description: `Duplicated email template "${source.name}" as "${duplicate.name}"`,
      metadata: { sourceTemplateId: id, newTemplateId: duplicate.id, newName: duplicate.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Template duplicated', {
      sourceTemplateId: id,
      newTemplateId: duplicate.id,
      duplicatedBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: mapTemplate(duplicate),
    });
  } catch (err) {
    logger.error('Duplicate template error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while duplicating the template.',
    });
  }
});

module.exports = router;
