const express = require('express');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope, requireOrg } = require('../middleware/tenantScope');
const { requireRole, requirePermission } = require('../middleware/rbac');

const router = express.Router();

// All audit log routes require authentication + org scope + admin
router.use(authenticate);
router.use(tenantScope);

// ---------------------------------------------------------------------------
// Helper: build WHERE clause from filter params
// ---------------------------------------------------------------------------
function buildAuditFilters(query, organizationId) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  // Always scope to organization
  if (organizationId) {
    conditions.push(`a.organization_id = $${paramIndex++}`);
    params.push(organizationId);
  }

  if (query.actor_id) {
    conditions.push(`a.actor_id = $${paramIndex++}`);
    params.push(query.actor_id);
  }

  if (query.action_type) {
    conditions.push(`a.action_type = $${paramIndex++}`);
    params.push(query.action_type);
  }

  if (query.target_type) {
    conditions.push(`a.target_type = $${paramIndex++}`);
    params.push(query.target_type);
  }

  if (query.target_id) {
    conditions.push(`a.target_id = $${paramIndex++}`);
    params.push(query.target_id);
  }

  if (query.date_from) {
    conditions.push(`a.created_at >= $${paramIndex++}`);
    params.push(query.date_from);
  }

  if (query.date_to) {
    conditions.push(`a.created_at <= $${paramIndex++}`);
    params.push(query.date_to);
  }

  if (query.search) {
    conditions.push(`a.description ILIKE $${paramIndex++}`);
    params.push(`%${query.search}%`);
  }

  return { conditions, params, paramIndex };
}

// ---------------------------------------------------------------------------
// GET / - List audit logs with filters and pagination
// ---------------------------------------------------------------------------
router.get('/', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10) || 1;
    let limit = parseInt(req.query.limit, 10) || 50;
    if (page < 1) page = 1;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;

    const { conditions, params, paramIndex } = buildAuditFilters(req.query, req.organizationId);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs a ${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    // Data query
    const offset = (page - 1) * limit;
    let pIdx = paramIndex;
    const dataResult = await db.query(
      `SELECT a.id, a.actor_id, a.actor_name, a.action_type, a.target_type,
              a.target_id, a.description, a.metadata, a.ip_address,
              a.user_agent, a.created_at
       FROM audit_logs a
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        logs: dataResult.rows.map((r) => ({
          id: r.id,
          actorId: r.actor_id,
          actorName: r.actor_name,
          actionType: r.action_type,
          targetType: r.target_type,
          targetId: r.target_id,
          description: r.description,
          metadata: r.metadata,
          ipAddress: r.ip_address,
          userAgent: r.user_agent,
          createdAt: r.created_at,
        })),
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (err) {
    logger.error('List audit logs error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing audit logs.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /export - Export audit logs as CSV
// ---------------------------------------------------------------------------
router.get('/export', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const { conditions, params } = buildAuditFilters(req.query, req.organizationId);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT a.id, a.actor_id, a.actor_name, a.action_type, a.target_type,
              a.target_id, a.description, a.metadata, a.ip_address,
              a.user_agent, a.created_at
       FROM audit_logs a
       ${whereClause}
       ORDER BY a.created_at DESC`,
      params
    );

    // Build CSV
    const csvHeaders = [
      'ID',
      'Actor ID',
      'Actor Name',
      'Action Type',
      'Target Type',
      'Target ID',
      'Description',
      'Metadata',
      'IP Address',
      'User Agent',
      'Created At',
    ];

    const csvRows = result.rows.map((r) => [
      escapeCsvField(r.id),
      escapeCsvField(r.actor_id),
      escapeCsvField(r.actor_name),
      escapeCsvField(r.action_type),
      escapeCsvField(r.target_type),
      escapeCsvField(r.target_id),
      escapeCsvField(r.description),
      escapeCsvField(JSON.stringify(r.metadata || {})),
      escapeCsvField(r.ip_address),
      escapeCsvField(r.user_agent),
      escapeCsvField(r.created_at ? new Date(r.created_at).toISOString() : ''),
    ].join(','));

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${timestamp}.csv"`);

    return res.send(csvContent);
  } catch (err) {
    logger.error('Export audit logs error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while exporting audit logs.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /action-types - Return distinct action_type values
// ---------------------------------------------------------------------------
router.get('/action-types', requireOrg, requirePermission('*'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT action_type
       FROM audit_logs
       WHERE organization_id = $1
       ORDER BY action_type ASC`,
      [req.organizationId]
    );

    return res.json({
      success: true,
      data: result.rows.map((r) => r.action_type),
    });
  } catch (err) {
    logger.error('List action types error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred while listing action types.',
    });
  }
});

// ---------------------------------------------------------------------------
// Helper: escape a value for safe CSV output
// ---------------------------------------------------------------------------
function escapeCsvField(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If the field contains a comma, double quote, or newline, wrap it in quotes
  // and escape any double quotes by doubling them.
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

module.exports = router;
