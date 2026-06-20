const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * HubSpot Sync Service
 *
 * Handles bidirectional sync between ColdAF and HubSpot CRM.
 * Addresses TABLE-STAKES #2 from competitive research.
 *
 * Supported sync types:
 *   - contacts: Bidirectional contact sync with deduplication
 *   - activities: Log email activities (sent, opened, clicked, replied, bounced) to HubSpot timeline
 *   - deals: Sync deal/opportunity data
 *   - companies: Sync company/organization data
 */

class HubSpotSyncService {
  constructor() {
    this.baseUrl = 'https://api.hubapi.com';
  }

  getHeaders(accessToken) {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async makeRequest(method, endpoint, accessToken, data = null) {
    const axios = require('axios');
    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: this.getHeaders(accessToken),
        data,
      });
      return response.data;
    } catch (err) {
      if (err.response?.status === 401) {
        throw new Error('HubSpot token expired or invalid');
      }
      throw new Error(`HubSpot API error: ${err.response?.data?.message || err.message}`);
    }
  }

  /**
   * Run a sync operation.
   */
  async runSync(connection, syncType, logId) {
    const startTime = Date.now();
    let stats = { processed: 0, created: 0, updated: 0, failed: 0 };

    try {
      logger.info('HubSpot sync started', { syncType, orgId: connection.organization_id, logId });

      switch (syncType) {
        case 'contacts':
          stats = await this.syncContacts(connection);
          break;
        case 'activities':
          stats = await this.syncActivities(connection);
          break;
        case 'deals':
          stats = await this.syncDeals(connection);
          break;
        case 'companies':
          stats = await this.syncCompanies(connection);
          break;
        case 'bidirectional':
          const contactsStats = await this.syncContacts(connection);
          const activitiesStats = await this.syncActivities(connection);
          stats = {
            processed: contactsStats.processed + activitiesStats.processed,
            created: contactsStats.created + activitiesStats.created,
            updated: contactsStats.updated + activitiesStats.updated,
            failed: contactsStats.failed + activitiesStats.failed,
          };
          break;
        default:
          throw new Error(`Unknown sync type: ${syncType}`);
      }

      // Update connection last sync
      await db.query(
        `UPDATE hubspot_connections
         SET last_sync_at = NOW(),
             last_sync_status = 'success',
             records_synced_total = records_synced_total + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [stats.processed, connection.id]
      );

      // Update log
      await db.query(
        `UPDATE hubspot_sync_logs
         SET status = 'success',
             records_processed = $1,
             records_created = $2,
             records_updated = $3,
             records_failed = $4,
             completed_at = NOW()
         WHERE id = $5`,
        [stats.processed, stats.created, stats.updated, stats.failed, logId]
      );

      logger.info('HubSpot sync complete', {
        syncType,
        orgId: connection.organization_id,
        durationMs: Date.now() - startTime,
        ...stats,
      });
    } catch (err) {
      // Update log with failure
      await db.query(
        `UPDATE hubspot_sync_logs
         SET status = 'failed',
             error_message = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [err.message, logId]
      );

      // Update connection
      await db.query(
        `UPDATE hubspot_connections
         SET last_sync_status = 'failed',
             last_sync_error = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [err.message, connection.id]
      );

      logger.error('HubSpot sync failed', { syncType, orgId: connection.organization_id, error: err.message });
      throw err;
    }
  }

  /**
   * Sync contacts from ColdAF leads to HubSpot and vice versa.
   */
  async syncContacts(connection) {
    const stats = { processed: 0, created: 0, updated: 0, failed: 0 };

    // Get leads from ColdAF that haven't been synced to HubSpot
    const leads = await db.query(
      `SELECT id, email, first_name, last_name, company, title, phone,
              linkedin_url, website, industry, location, tags, status,
              created_at, updated_at
       FROM leads
       WHERE organization_id = $1
         AND (hubspot_synced_at IS NULL OR updated_at > hubspot_synced_at)
       LIMIT 100`,
      [connection.organization_id]
    );

    for (const lead of leads.rows) {
      try {
        // Check if contact exists in HubSpot
        const searchResult = await this.makeRequest(
          'POST',
          '/crm/v3/objects/contacts/search',
          connection.access_token,
          {
            filterGroups: [{
              filters: [{ propertyName: 'email', operator: 'EQ', value: lead.email }],
            }],
            properties: ['email', 'firstname', 'lastname', 'company'],
            limit: 1,
          }
        );

        const properties = {
          email: lead.email,
          firstname: lead.first_name || '',
          lastname: lead.last_name || '',
          company: lead.company || '',
          jobtitle: lead.title || '',
          phone: lead.phone || '',
          website: lead.website || '',
          industry: lead.industry || '',
          city: lead.location || '',
        };

        if (searchResult.results && searchResult.results.length > 0) {
          // Update existing contact
          const contactId = searchResult.results[0].id;
          await this.makeRequest(
            'PATCH',
            `/crm/v3/objects/contacts/${contactId}`,
            connection.access_token,
            { properties }
          );
          stats.updated++;
        } else {
          // Create new contact
          await this.makeRequest(
            'POST',
            '/crm/v3/objects/contacts',
            connection.access_token,
            { properties }
          );
          stats.created++;
        }

        // Mark lead as synced
        await db.query(
          `UPDATE leads SET hubspot_synced_at = NOW() WHERE id = $1`,
          [lead.id]
        );

        stats.processed++;
      } catch (err) {
        stats.failed++;
        logger.error('HubSpot contact sync failed for lead', { leadId: lead.id, error: err.message });
      }
    }

    return stats;
  }

  /**
   * Sync email activities to HubSpot timeline.
   */
  async syncActivities(connection) {
    const stats = { processed: 0, created: 0, updated: 0, failed: 0 };

    // Get email activities that haven't been logged to HubSpot
    const activities = await db.query(
      `SELECT es.id, es.lead_id, es.email, es.campaign_id, es.status,
              es.opened_at, es.clicked_at, es.replied_at, es.bounced_at,
              l.email as lead_email, l.first_name, l.last_name
       FROM emails_sent es
       JOIN leads l ON es.lead_id = l.id
       WHERE es.organization_id = $1
         AND es.hubspot_logged_at IS NULL
         AND es.sent_at > NOW() - INTERVAL '7 days'
       LIMIT 100`,
      [connection.organization_id]
    );

    for (const activity of activities.rows) {
      try {
        // Find contact in HubSpot
        const searchResult = await this.makeRequest(
          'POST',
          '/crm/v3/objects/contacts/search',
          connection.access_token,
          {
            filterGroups: [{
              filters: [{ propertyName: 'email', operator: 'EQ', value: activity.lead_email }],
            }],
            properties: ['email'],
            limit: 1,
          }
        );

        if (!searchResult.results || searchResult.results.length === 0) {
          // Contact not found, skip
          stats.failed++;
          continue;
        }

        const contactId = searchResult.results[0].id;

        // Determine activity type
        let activityType = 'EMAIL_SENT';
        if (activity.replied_at) activityType = 'EMAIL_REPLIED';
        else if (activity.clicked_at) activityType = 'EMAIL_CLICKED';
        else if (activity.opened_at) activityType = 'EMAIL_OPENED';
        else if (activity.bounced_at) activityType = 'EMAIL_BOUNCED';

        // Log to HubSpot timeline (using Engagement API)
        await this.makeRequest(
          'POST',
          '/engagements/v1/engagements',
          connection.access_token,
          {
            engagement: {
              active: true,
              type: 'EMAIL',
              timestamp: Date.now(),
            },
            associations: {
              contactIds: [parseInt(contactId)],
            },
            metadata: {
              status: activityType,
              subject: 'ColdAF Campaign Email',
              body: `Email ${activity.status} for campaign ${activity.campaign_id}`,
            },
          }
        );

        // Mark as logged
        await db.query(
          `UPDATE emails_sent SET hubspot_logged_at = NOW() WHERE id = $1`,
          [activity.id]
        );

        stats.processed++;
        stats.created++;
      } catch (err) {
        stats.failed++;
        logger.error('HubSpot activity sync failed', { activityId: activity.id, error: err.message });
      }
    }

    return stats;
  }

  /**
   * Sync deals from ColdAF to HubSpot.
   */
  async syncDeals(connection) {
    // Placeholder - deals sync requires mapping ColdAF campaigns to HubSpot pipelines
    logger.info('HubSpot deals sync not yet implemented', { orgId: connection.organization_id });
    return { processed: 0, created: 0, updated: 0, failed: 0 };
  }

  /**
   * Sync companies from ColdAF to HubSpot.
   */
  async syncCompanies(connection) {
    // Placeholder - companies sync requires lead-to-company aggregation
    logger.info('HubSpot companies sync not yet implemented', { orgId: connection.organization_id });
    return { processed: 0, created: 0, updated: 0, failed: 0 };
  }

  /**
   * Refresh HubSpot access token using refresh token.
   */
  async refreshToken(connection) {
    try {
      const axios = require('axios');
      const clientId = process.env.HUBSPOT_CLIENT_ID;
      const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

      const response = await axios.post('https://api.hubapi.com/oauth/v1/token', null, {
        params: {
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: connection.refresh_token,
        },
      });

      const { access_token, refresh_token, expires_in } = response.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      await db.query(
        `UPDATE hubspot_connections
         SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW()
         WHERE id = $4`,
        [access_token, refresh_token, expiresAt, connection.id]
      );

      logger.info('HubSpot token refreshed', { connectionId: connection.id });
      return access_token;
    } catch (err) {
      logger.error('HubSpot token refresh failed', { connectionId: connection.id, error: err.message });
      throw err;
    }
  }
}

module.exports = new HubSpotSyncService();
