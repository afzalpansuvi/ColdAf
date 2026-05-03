const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse');
const { Readable } = require('stream');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const audit = require('../services/audit');
const { isValidEmail } = require('../utils/validators');

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer configuration for CSV uploads (memory storage)
// ---------------------------------------------------------------------------
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    const allowedMimes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed.'), false);
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_STATUSES = [
  'new', 'queued', 'sent', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed',
];

const VALID_SOURCE_TYPES = ['google_sheets', 'csv', 'webhook', 'manual'];

const VALID_SORT_FIELDS = ['created_at', 'full_name', 'email', 'status'];

const COLUMN_MAP = {
  full_name: ['full_name', 'name', 'Full Name', 'Name', 'fullname'],
  email: ['email', 'Email', 'email_address', 'Email Address'],
  phone: ['phone', 'Phone', 'phone_number', 'Phone Number'],
  lead_type: ['lead_type', 'type', 'Lead Type', 'Type'],
  industry: ['industry', 'Industry'],
  project_details: ['project_details', 'notes', 'Notes', 'Project Details', 'details'],
  // Enrichment fields
  job_title: ['job_title', 'Job Title', 'Title', 'title'],
  company_name: ['company_name', 'Company', 'Company Name', 'company'],
  company_size: ['company_size', 'Employees', 'Number of Employees', 'company_employees'],
  linkedin_url: ['linkedin_url', 'LinkedIn URL', 'Person Linkedin Url', 'linkedin'],
  tech_stack: ['tech_stack', 'Tech Stack', 'Technologies', 'technologies'],
  recent_news: ['recent_news', 'Recent News', 'News', 'Context', 'context'],
  enrichment_source: ['enrichment_source', 'Enrichment Source', 'source'],
};

/**
 * Maps a raw CSV row to normalised lead field names using COLUMN_MAP.
 */
function mapCsvRow(raw) {
  const mapped = {};
  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    for (const alias of aliases) {
      if (raw[alias] !== undefined && raw[alias] !== null && String(raw[alias]).trim() !== '') {
        mapped[field] = String(raw[alias]).trim();
        break;
      }
    }
  }
  return mapped;
}

/**
 * Parses a CSV buffer and returns an array of row objects.
 */
function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true, bom: true }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', (err) => reject(err));
  });
}

// ---------------------------------------------------------------------------
// GET / - List leads with filtering, searching, pagination, sorting
// ---------------------------------------------------------------------------
router.get('/', authenticate, tenantScope, async (req, res) => {
  try {
    const {
      brand_id,
      status,
      source_type,
      lead_type,
      industry,
      search,
      date_from,
      date_to,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = req.query;

    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 50;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const conditions = [`l.organization_id = $1`];
    const params = [req.organizationId];
    let paramIndex = 2;

    if (brand_id) {
      conditions.push(`l.brand_id = $${paramIndex++}`);
      params.push(brand_id);
    }

    if (status) {
      if (VALID_STATUSES.includes(status)) {
        conditions.push(`l.status = $${paramIndex++}`);
        params.push(status);
      }
    }

    if (source_type) {
      if (VALID_SOURCE_TYPES.includes(source_type)) {
        conditions.push(`l.source_type = $${paramIndex++}`);
        params.push(source_type);
      }
    }

    if (lead_type) {
      conditions.push(`l.lead_type = $${paramIndex++}`);
      params.push(lead_type);
    }

    if (industry) {
      conditions.push(`l.industry = $${paramIndex++}`);
      params.push(industry);
    }

    if (search) {
      conditions.push(`(l.full_name ILIKE $${paramIndex} OR l.email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (date_from) {
      conditions.push(`l.created_at >= $${paramIndex++}`);
      params.push(date_from);
    }

    if (date_to) {
      conditions.push(`l.created_at <= $${paramIndex++}`);
      params.push(date_to);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Validate sort
    const safeSortBy = VALID_SORT_FIELDS.includes(sort_by) ? sort_by : 'created_at';
    const safeSortOrder = sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Count query
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM leads l ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    // Data query
    const offset = (page - 1) * limit;
    const dataResult = await db.query(
      `SELECT l.id, l.full_name, l.email, l.phone, l.lead_type, l.industry,
              l.project_details, l.source_type, l.source_detail, l.status,
              l.unsubscribed, l.brand_id, l.created_at, l.updated_at,
              l.job_title, l.company_name, l.company_size, l.linkedin_url,
              l.tech_stack, l.recent_news, l.enrichment_source
       FROM leads l
       ${whereClause}
       ORDER BY l.${safeSortBy} ${safeSortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        leads: dataResult.rows,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    logger.error('List leads error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing leads.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /stats - Lead statistics
// ---------------------------------------------------------------------------
router.get('/stats', authenticate, tenantScope, async (req, res) => {
  try {
    // Total count
    const totalResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM leads WHERE organization_id = $1`,
      [req.organizationId]
    );

    // Count per status
    const statusResult = await db.query(
      `SELECT status, COUNT(*)::int AS count FROM leads WHERE organization_id = $1 GROUP BY status ORDER BY count DESC`,
      [req.organizationId]
    );

    // Count per source_type
    const sourceResult = await db.query(
      `SELECT source_type, COUNT(*)::int AS count FROM leads WHERE organization_id = $1 GROUP BY source_type ORDER BY count DESC`,
      [req.organizationId]
    );

    // Count per brand
    const brandResult = await db.query(
      `SELECT l.brand_id, b.name AS brand_name, COUNT(*)::int AS count
       FROM leads l
       LEFT JOIN brands b ON b.id = l.brand_id
       WHERE l.organization_id = $1
       GROUP BY l.brand_id, b.name
       ORDER BY count DESC`,
      [req.organizationId]
    );

    // Leads added today, this week, this month
    const periodResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('week', CURRENT_DATE))::int AS this_week,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE))::int AS this_month
       FROM leads
       WHERE organization_id = $1`,
      [req.organizationId]
    );

    const periods = periodResult.rows[0];

    return res.json({
      success: true,
      data: {
        total: totalResult.rows[0].total,
        byStatus: statusResult.rows,
        bySourceType: sourceResult.rows,
        byBrand: brandResult.rows,
        addedToday: periods.today,
        addedThisWeek: periods.this_week,
        addedThisMonth: periods.this_month,
      },
    });
  } catch (err) {
    logger.error('Lead stats error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching lead statistics.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /:id - Get single lead with emails_sent and reply_messages
// ---------------------------------------------------------------------------
router.get('/:id', authenticate, tenantScope, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch lead
    const leadResult = await db.query(
      `SELECT id, full_name, email, phone, lead_type, industry, project_details,
              source_type, source_detail, status, unsubscribed, brand_id,
              created_at, updated_at,
              job_title, company_name, company_size, linkedin_url,
              tech_stack, recent_news, enrichment_source
       FROM leads
       WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found.',
      });
    }

    const lead = leadResult.rows[0];

    // Fetch emails sent to this lead
    const emailsResult = await db.query(
      `SELECT id, subject, status, sent_at
       FROM emails_sent
       WHERE lead_id = $1
       ORDER BY sent_at DESC`,
      [id]
    );

    // Fetch reply messages for this lead
    const repliesResult = await db.query(
      `SELECT id, subject, body_snippet, received_at
       FROM reply_messages
       WHERE lead_id = $1
       ORDER BY received_at DESC`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        ...lead,
        emailsSent: emailsResult.rows,
        replyMessages: repliesResult.rows,
      },
    });
  } catch (err) {
    logger.error('Get lead error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while fetching the lead.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST / - Create single lead manually (admin only)
// ---------------------------------------------------------------------------
router.post('/', authenticate, tenantScope, requireRole('admin'), async (req, res) => {
  try {
    const {
      full_name, email, phone, lead_type, industry, project_details, brand_id,
      job_title, company_name, company_size, linkedin_url, tech_stack, recent_news, enrichment_source,
    } = req.body;

    // Validation
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'full_name is required.',
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'email is required.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format.',
      });
    }

    if (!brand_id) {
      return res.status(400).json({
        success: false,
        message: 'brand_id is required.',
      });
    }

    // Check duplicate (email + brand_id unique within org)
    const dupCheck = await db.query(
      `SELECT id FROM leads WHERE email = $1 AND brand_id = $2 AND organization_id = $3`,
      [normalizedEmail, brand_id, req.organizationId]
    );

    if (dupCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A lead with this email already exists for the specified brand.',
      });
    }

    const result = await db.query(
      `INSERT INTO leads
        (full_name, email, phone, lead_type, industry, project_details,
         source_type, source_detail, status, unsubscribed, brand_id, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'manual', 'Manual entry', 'new', false, $7, $8)
       RETURNING *`,
      [
        full_name.trim(),
        normalizedEmail,
        phone || null,
        lead_type || null,
        industry || null,
        project_details || null,
        brand_id,
        req.organizationId,
      ]
    );

    const lead = result.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'lead.create',
      targetType: 'lead',
      targetId: lead.id,
      description: `Admin manually created lead "${lead.full_name}" (${lead.email})`,
      metadata: { email: lead.email, brandId: brand_id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Lead created', { leadId: lead.id, email: lead.email, createdBy: req.user.id });

    return res.status(201).json({
      success: true,
      data: lead,
    });
  } catch (err) {
    logger.error('Create lead error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while creating the lead.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /:id - Update lead fields (admin only)
// ---------------------------------------------------------------------------
router.put('/:id', authenticate, tenantScope, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify lead exists within org
    const leadCheck = await db.query(`SELECT id, full_name, email FROM leads WHERE id = $1 AND organization_id = $2`, [id, req.organizationId]);
    if (leadCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found.',
      });
    }

    const existingLead = leadCheck.rows[0];

    const allowedFields = [
      'full_name', 'email', 'phone', 'lead_type', 'industry',
      'project_details', 'source_type', 'source_detail', 'status',
      'unsubscribed', 'brand_id',
    ];

    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];

        // Validate email if being updated
        if (field === 'email') {
          value = String(value).trim().toLowerCase();
          if (!isValidEmail(value)) {
            return res.status(400).json({
              success: false,
              message: 'Invalid email format.',
            });
          }

          // Check uniqueness with brand_id
          const brandId = req.body.brand_id !== undefined ? req.body.brand_id : null;
          const dupCheck = await db.query(
            `SELECT id FROM leads
             WHERE email = $1
               AND brand_id = COALESCE($2, brand_id)
               AND id != $3
               AND organization_id = $4`,
            [value, brandId, id, req.organizationId]
          );
          if (dupCheck.rows.length > 0) {
            return res.status(409).json({
              success: false,
              message: 'A lead with this email already exists for the specified brand.',
            });
          }
        }

        // Validate status if being updated
        if (field === 'status' && !VALID_STATUSES.includes(value)) {
          return res.status(400).json({
            success: false,
            message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
          });
        }

        // Validate source_type if being updated
        if (field === 'source_type' && !VALID_SOURCE_TYPES.includes(value)) {
          return res.status(400).json({
            success: false,
            message: `Invalid source_type. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`,
          });
        }

        setClauses.push(`${field} = $${paramIndex++}`);
        params.push(value);
      }
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
      `UPDATE leads
       SET ${setClauses.join(', ')}
       WHERE id = ${idPlaceholder} AND organization_id = ${orgPlaceholder}
       RETURNING *`,
      params
    );

    const lead = updateResult.rows[0];

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'lead.update',
      targetType: 'lead',
      targetId: id,
      description: `Admin updated lead "${existingLead.full_name}" (${existingLead.email})`,
      metadata: { updatedFields: Object.keys(req.body) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Lead updated', { leadId: id, updatedBy: req.user.id });

    return res.json({
      success: true,
      data: lead,
    });
  } catch (err) {
    logger.error('Update lead error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while updating the lead.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /import-csv - CSV lead import with preview and confirm (admin only)
// ---------------------------------------------------------------------------
router.post('/import-csv', authenticate, tenantScope, requireRole('admin'), (req, res, next) => {
  csvUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds the 10 MB limit.',
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
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No CSV file provided. Upload a file with the field name "file".',
      });
    }

    const { brand_id } = req.body;
    if (!brand_id) {
      return res.status(400).json({
        success: false,
        message: 'brand_id is required for CSV import.',
      });
    }

    const confirm = req.query.confirm === 'true';
    const originalFilename = req.file.originalname;

    // Parse CSV
    let rawRows;
    try {
      rawRows = await parseCsvBuffer(req.file.buffer);
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        message: `Failed to parse CSV: ${parseErr.message}`,
      });
    }

    if (rawRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is empty or contains no data rows.',
      });
    }

    // Map and validate each row
    const valid = [];
    const invalid = [];
    const emailsInFile = [];

    for (let i = 0; i < rawRows.length; i++) {
      const mapped = mapCsvRow(rawRows[i]);
      const rowNum = i + 1;
      const errors = [];

      if (!mapped.full_name) {
        errors.push(`Row ${rowNum}: full_name is required`);
      }

      if (!mapped.email) {
        errors.push(`Row ${rowNum}: email is required`);
      } else {
        mapped.email = mapped.email.toLowerCase();
        if (!isValidEmail(mapped.email)) {
          errors.push(`Row ${rowNum}: invalid email "${mapped.email}"`);
        }
      }

      if (errors.length > 0) {
        invalid.push({ row: rowNum, data: mapped, errors });
      } else {
        emailsInFile.push(mapped.email);
        valid.push({ row: rowNum, data: mapped });
      }
    }

    // Batch check for duplicates against existing DB leads
    let duplicates = [];
    const validNonDup = [];

    if (emailsInFile.length > 0) {
      const dupResult = await db.query(
        `SELECT email FROM leads WHERE email = ANY($1) AND brand_id = $2 AND organization_id = $3`,
        [emailsInFile, brand_id, req.organizationId]
      );
      const existingEmails = new Set(dupResult.rows.map((r) => r.email));

      for (const entry of valid) {
        if (existingEmails.has(entry.data.email)) {
          duplicates.push({ row: entry.row, data: entry.data, reason: 'Email already exists for this brand' });
        } else {
          validNonDup.push(entry);
        }
      }
    } else {
      // All rows were invalid, no duplicates to check
    }

    // If not confirming, return the preview
    if (!confirm) {
      return res.json({
        success: true,
        data: {
          valid: validNonDup.map((e) => e.data),
          invalid: invalid.map((e) => ({ row: e.row, data: e.data, errors: e.errors })),
          duplicates: duplicates.map((e) => ({ row: e.row, data: e.data, reason: e.reason })),
          total: rawRows.length,
          validCount: validNonDup.length,
          invalidCount: invalid.length,
          duplicateCount: duplicates.length,
        },
      });
    }

    // Confirm mode: bulk insert the valid, non-duplicate rows
    if (validNonDup.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid leads to import after filtering duplicates and invalid rows.',
      });
    }

    // Build bulk INSERT using parameterised values
    const insertValues = [];
    const insertParams = [];
    let pIdx = 1;

    for (const entry of validNonDup) {
      const d = entry.data;
      insertValues.push(
        `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, 'csv', $${pIdx++}, 'new', false, $${pIdx++}, $${pIdx++})`
      );
      insertParams.push(
        d.full_name,
        d.email,
        d.phone || null,
        d.lead_type || null,
        d.industry || null,
        d.project_details || null,
        originalFilename,
        brand_id,
        req.organizationId
      );
    }

    const insertSql = `
      INSERT INTO leads
        (full_name, email, phone, lead_type, industry, project_details,
         source_type, source_detail, status, unsubscribed, brand_id, organization_id)
      VALUES ${insertValues.join(', ')}
      RETURNING id
    `;

    const insertResult = await db.query(insertSql, insertParams);
    const importedCount = insertResult.rows.length;

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'lead.import_csv',
      targetType: 'lead',
      targetId: null,
      description: `Admin imported ${importedCount} leads from CSV "${originalFilename}"`,
      metadata: {
        filename: originalFilename,
        importedCount,
        invalidCount: invalid.length,
        duplicateCount: duplicates.length,
        brandId: brand_id,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('CSV leads imported', {
      importedCount,
      filename: originalFilename,
      importedBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: {
        importedCount,
        invalidCount: invalid.length,
        duplicateCount: duplicates.length,
        total: rawRows.length,
      },
    });
  } catch (err) {
    logger.error('CSV import error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while importing the CSV.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /unsubscribe/:id - Public unsubscribe endpoint (no auth)
// ---------------------------------------------------------------------------
router.post('/unsubscribe/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE leads
       SET unsubscribed = true, status = 'unsubscribed', updated_at = NOW()
       WHERE id = $1
       RETURNING id, email`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found.',
      });
    }

    logger.info('Lead unsubscribed', { leadId: id, email: result.rows[0].email });

    return res.json({
      success: true,
      message: 'You have been successfully unsubscribed.',
    });
  } catch (err) {
    logger.error('Unsubscribe error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while processing your unsubscribe request.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id - Hard delete lead (admin only)
// ---------------------------------------------------------------------------
router.delete('/:id', authenticate, tenantScope, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Verify lead exists within org
    const leadCheck = await db.query(
      `SELECT id, full_name, email FROM leads WHERE id = $1 AND organization_id = $2`,
      [id, req.organizationId]
    );

    if (leadCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found.',
      });
    }

    const lead = leadCheck.rows[0];

    await db.query(`DELETE FROM leads WHERE id = $1 AND organization_id = $2`, [id, req.organizationId]);

    // Audit log
    await audit.logAction({
      actorId: req.user.id,
      actorName: req.user.email,
      actionType: 'lead.delete',
      targetType: 'lead',
      targetId: id,
      description: `Admin deleted lead "${lead.full_name}" (${lead.email})`,
      metadata: { email: lead.email, fullName: lead.full_name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    logger.info('Lead deleted', { leadId: id, deletedBy: req.user.id });

    return res.json({
      success: true,
      message: `Lead "${lead.full_name}" has been deleted.`,
    });
  } catch (err) {
    logger.error('Delete lead error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while deleting the lead.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /bulk-action - Bulk operations on leads (admin only)
// ---------------------------------------------------------------------------
router.post('/bulk-action', authenticate, tenantScope, requireRole('admin'), async (req, res) => {
  try {
    const { leadIds, action, status } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'leadIds must be a non-empty array.',
      });
    }

    if (!action) {
      return res.status(400).json({
        success: false,
        message: 'action is required.',
      });
    }

    const allowedActions = ['delete', 'change_status'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: `Invalid action. Must be one of: ${allowedActions.join(', ')}`,
      });
    }

    let affectedCount = 0;

    if (action === 'delete') {
      const deleteResult = await db.query(
        `DELETE FROM leads WHERE id = ANY($1) AND organization_id = $2`,
        [leadIds, req.organizationId]
      );
      affectedCount = deleteResult.rowCount;

      await audit.logAction({
        actorId: req.user.id,
        actorName: req.user.email,
        actionType: 'lead.bulk_delete',
        targetType: 'lead',
        targetId: null,
        description: `Admin bulk-deleted ${affectedCount} leads`,
        metadata: { leadIds, requestedCount: leadIds.length, affectedCount },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    } else if (action === 'change_status') {
      if (!status || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid or missing status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        });
      }

      const updateResult = await db.query(
        `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = ANY($2) AND organization_id = $3`,
        [status, leadIds, req.organizationId]
      );
      affectedCount = updateResult.rowCount;

      await audit.logAction({
        actorId: req.user.id,
        actorName: req.user.email,
        actionType: 'lead.bulk_status_change',
        targetType: 'lead',
        targetId: null,
        description: `Admin bulk-changed status to "${status}" for ${affectedCount} leads`,
        metadata: { leadIds, status, requestedCount: leadIds.length, affectedCount },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    logger.info('Bulk action performed', {
      action,
      affectedCount,
      performedBy: req.user.id,
    });

    return res.json({
      success: true,
      data: {
        action,
        affectedCount,
        requestedCount: leadIds.length,
      },
    });
  } catch (err) {
    logger.error('Bulk action error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while performing the bulk action.',
    });
  }
});

module.exports = router;
