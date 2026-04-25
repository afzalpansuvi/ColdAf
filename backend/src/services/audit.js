const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Writes an entry to the audit_logs table.
 *
 * @param {Object} params
 * @param {string}  [params.actorId]         - UUID of the user performing the action (null for system)
 * @param {string}  [params.actorName]       - Display name of the actor (defaults to 'System')
 * @param {string}   params.actionType       - Type of action (e.g. 'user.login', 'campaign.create')
 * @param {string}  [params.targetType]      - Entity type affected (e.g. 'campaign', 'lead', 'smtp_account')
 * @param {string}  [params.targetId]        - UUID of the affected entity
 * @param {string}   params.description      - Human-readable description of what happened
 * @param {Object}  [params.metadata]        - Additional JSON data to store
 * @param {string}  [params.ipAddress]       - IP address of the request
 * @param {string}  [params.userAgent]       - User-Agent header from the request
 * @param {string}  [params.organizationId]  - UUID of the organization (tenant scope)
 */
async function logAction({
  actorId = null,
  actorName = 'System',
  actionType,
  targetType = null,
  targetId = null,
  description,
  metadata = {},
  ipAddress = null,
  userAgent = null,
  organizationId = null,
} = {}) {
  if (!actionType) {
    logger.warn('audit.logAction called without actionType, skipping');
    return;
  }

  if (!description) {
    logger.warn('audit.logAction called without description, skipping');
    return;
  }

  try {
    const sql = `
      INSERT INTO audit_logs
        (actor_id, actor_name, action_type, target_type, target_id, description, metadata, ip_address, user_agent, organization_id)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const params = [
      actorId,
      actorName,
      actionType,
      targetType,
      targetId,
      description,
      JSON.stringify(metadata),
      ipAddress,
      userAgent,
      organizationId,
    ];

    const result = await db.query(sql, params);

    logger.debug('Audit log created', {
      auditId: result.rows[0].id,
      actionType,
      actorName,
      targetType,
      targetId,
      organizationId,
    });

    return result.rows[0].id;
  } catch (err) {
    // Audit logging should never crash the calling operation.
    // Log the failure and continue.
    logger.error('Failed to write audit log', {
      error: err.message,
      actionType,
      description,
      actorId,
    });
  }
}

module.exports = { logAction };
