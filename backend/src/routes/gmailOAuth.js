const express = require('express');
const crypto = require('crypto');
const { google } = require('googleapis');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { encrypt, decrypt } = require('../utils/encryption');
const audit = require('../services/audit');

const router = express.Router();

// ---------------------------------------------------------------------------
// Gmail OAuth configuration
// ---------------------------------------------------------------------------
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/gmail/oauth/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Gmail OAuth not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ---------------------------------------------------------------------------
// GET /gmail/oauth/start - Begin OAuth consent flow
// Requires ?brand_id=<uuid> so we know which brand the connected Gmail serves.
// ---------------------------------------------------------------------------
router.get('/start', authenticate, tenantScope, async (req, res) => {
  try {
    const { brand_id } = req.query;
    if (!brand_id) {
      return res.status(400).json({
        success: false,
        message: 'brand_id query param is required',
      });
    }

    // Verify brand belongs to this org
    const brandResult = await db.query(
      'SELECT id FROM brands WHERE id = $1 AND organization_id = $2',
      [brand_id, req.organizationId]
    );
    if (brandResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    const state = crypto.randomBytes(32).toString('hex');

    await db.query(
      `INSERT INTO oauth_states (state, user_id, organization_id, brand_id, provider, expires_at)
       VALUES ($1, $2, $3, $4, 'gmail', NOW() + INTERVAL '10 minutes')`,
      [state, req.user.id, req.organizationId, brand_id]
    );

    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GMAIL_SCOPES,
      state,
    });

    return res.json({ success: true, data: { url } });
  } catch (err) {
    logger.error('Gmail OAuth start error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to start Gmail OAuth flow',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /gmail/oauth/callback - Google redirects here with a code
// ---------------------------------------------------------------------------
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  const closePopup = (payload) => `
    <!doctype html><html><body>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage(${JSON.stringify(payload)}, '*');
        }
      } catch (_) {}
      window.close();
    </script>
    <p>You can close this window.</p>
    </body></html>
  `;

  if (error) {
    return res.send(
      closePopup({ type: 'gmail_oauth', success: false, error: String(error) })
    );
  }

  if (!code || !state) {
    return res.send(
      closePopup({ type: 'gmail_oauth', success: false, error: 'missing_code_or_state' })
    );
  }

  try {
    // Validate state token
    const stateResult = await db.query(
      `SELECT user_id, organization_id, brand_id
         FROM oauth_states
        WHERE state = $1 AND provider = 'gmail' AND expires_at > NOW()`,
      [state]
    );

    if (stateResult.rows.length === 0) {
      return res.send(
        closePopup({ type: 'gmail_oauth', success: false, error: 'invalid_or_expired_state' })
      );
    }

    const { user_id, organization_id, brand_id } = stateResult.rows[0];
    await db.query('DELETE FROM oauth_states WHERE state = $1', [state]);

    // Exchange code for tokens
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch the connected user's email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const gmailEmail = userInfo.email;

    if (!gmailEmail) {
      return res.send(
        closePopup({ type: 'gmail_oauth', success: false, error: 'no_email_in_token' })
      );
    }

    const encryptedAccess = tokens.access_token ? encrypt(tokens.access_token) : null;
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    // Upsert: if the same oauth_email+org already exists, update tokens; else insert
    const existing = await db.query(
      `SELECT id FROM smtp_accounts
        WHERE organization_id = $1 AND oauth_email = $2 AND provider = 'gmail'`,
      [organization_id, gmailEmail]
    );

    let accountId;
    if (existing.rows.length > 0) {
      accountId = existing.rows[0].id;
      await db.query(
        `UPDATE smtp_accounts SET
           oauth_access_token = $1,
           oauth_refresh_token = COALESCE($2, oauth_refresh_token),
           oauth_token_expires_at = $3,
           oauth_scope = $4,
           oauth_status = 'active',
           brand_id = $5,
           is_active = TRUE,
           updated_at = NOW()
         WHERE id = $6`,
        [encryptedAccess, encryptedRefresh, expiresAt, GMAIL_SCOPES.join(' '), brand_id, accountId]
      );
    } else {
      const insertResult = await db.query(
        `INSERT INTO smtp_accounts (
           organization_id, brand_id, email_address, display_name,
           provider, oauth_provider, oauth_email,
           oauth_access_token, oauth_refresh_token, oauth_token_expires_at, oauth_scope,
           oauth_status, use_tls, daily_send_limit, is_active
         ) VALUES ($1, $2, $3, $3, 'gmail', 'gmail', $3, $4, $5, $6, $7, 'active', TRUE, 500, TRUE)
         RETURNING id`,
        [organization_id, brand_id, gmailEmail, encryptedAccess, encryptedRefresh, expiresAt, GMAIL_SCOPES.join(' ')]
      );
      accountId = insertResult.rows[0].id;
    }

    audit.log({
      userId: user_id,
      organizationId: organization_id,
      action: 'smtp_account.gmail_connected',
      resourceType: 'smtp_account',
      resourceId: accountId,
      metadata: { email: gmailEmail },
    }).catch((e) => logger.warn('Audit log failed', { error: e.message }));

    return res.send(
      closePopup({
        type: 'gmail_oauth',
        success: true,
        email: gmailEmail,
        account_id: accountId,
      })
    );
  } catch (err) {
    logger.error('Gmail OAuth callback error', { error: err.message, stack: err.stack });
    return res.send(
      closePopup({ type: 'gmail_oauth', success: false, error: err.message })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /gmail/oauth/disconnect/:id - Revoke and delete a Gmail account row
// ---------------------------------------------------------------------------
router.post('/disconnect/:id', authenticate, tenantScope, async (req, res) => {
  try {
    const accountResult = await db.query(
      `SELECT id, oauth_refresh_token, oauth_email
         FROM smtp_accounts
        WHERE id = $1 AND organization_id = $2 AND provider = 'gmail'`,
      [req.params.id, req.organizationId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Gmail account not found' });
    }

    const account = accountResult.rows[0];

    // Attempt to revoke the token on Google's side (best-effort, ignore failure)
    try {
      if (account.oauth_refresh_token) {
        const oauth2Client = getOAuth2Client();
        const refreshToken = decrypt(account.oauth_refresh_token);
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        await oauth2Client.revokeToken(refreshToken);
      }
    } catch (revokeErr) {
      logger.warn('Gmail token revoke failed (continuing)', { error: revokeErr.message });
    }

    await db.query(
      `DELETE FROM smtp_accounts WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.organizationId]
    );

    audit.log({
      userId: req.user.id,
      organizationId: req.organizationId,
      action: 'smtp_account.gmail_disconnected',
      resourceType: 'smtp_account',
      resourceId: req.params.id,
      metadata: { email: account.oauth_email },
    }).catch((e) => logger.warn('Audit log failed', { error: e.message }));

    return res.json({ success: true });
  } catch (err) {
    logger.error('Gmail OAuth disconnect error', { error: err.message, stack: err.stack });
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to disconnect Gmail',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /gmail/oauth/:id/reconnect - mark token as needing a re-auth (frontend
// calls /start again to re-grant the refresh token)
// ---------------------------------------------------------------------------
router.post('/:id/reconnect', authenticate, tenantScope, async (req, res) => {
  try {
    await db.query(
      `UPDATE smtp_accounts
          SET oauth_status = 'expired', updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND provider = 'gmail'`,
      [req.params.id, req.organizationId]
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error('Gmail reconnect mark error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed' });
  }
});

module.exports = router;
