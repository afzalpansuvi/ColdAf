# ColdAF Email Tool

Production-ready cold email management and automation platform for multi-brand outreach campaigns with AI-powered email generation, AI phone calling, real-time analytics, and full deliverability management.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Database | PostgreSQL 16 |
| Queue | Bull (Redis-backed) |
| Frontend | React 18 + Vite + Tailwind CSS |
| Email Sending | Nodemailer (SMTP) + SendGrid + Mailgun |
| Phone Calls | Vapi.ai (outbound AI voice) |
| AI | Anthropic Claude + OpenAI + Google Gemini |
| Auth | JWT (bcrypt, HTTP-only cookies) |
| Scheduler | node-cron |
| Containerization | Docker Compose |

## Features

- **Multi-brand management** -- 4+ brands with independent SMTP accounts, AI prompts, and sending rules
- **AI email generation** -- Personalized cold emails via Claude/GPT/Gemini with per-brand tone/style
- **Campaign management** -- Multi-brand campaigns, follow-up sequences, scheduling, A/B testing
- **3-source lead intake** -- Google Sheets (auto-poll), CSV upload, webhooks
- **SMTP health monitoring** -- SPF/DKIM/DMARC checks, bounce/spam rate tracking, auto-pause
- **Reply tracking** -- IMAP inbox monitoring, threaded conversations, in-dashboard reply
- **Real-time analytics** -- Funnel charts, timelines, heatmaps, A/B comparisons, date range comparison
- **AI monitoring agent** -- Periodic health checks with automated alerting and campaign control
- **Phone call agent** -- Automated outbound AI calls via Vapi.ai with custom call scripts, knowledge base, transcripts, recordings, and summaries
- **Admin AI chat** -- Natural language interface to modify brand prompts and campaign settings
- **Role-based access** -- Admin and Sales roles with extensible permission system
- **Audit logging** -- Every action logged with actor, timestamp, and metadata
- **Deliverability** -- Rate limiting, randomized delays, unsubscribe handling, List-Unsubscribe headers
- **Webhook integrations** -- Inbound webhooks for lead intake with auto-generated URLs + outbound webhooks for event notifications

## Project File Structure

```
backend/
  src/
    config/
      database.js        -- PostgreSQL connection pool
      env.js             -- Environment variable loader (all config)
      redis.js           -- Redis connection for Bull queues
    db/
      migrations/
        001_initial_schema.sql        -- Core tables (users, brands, leads, campaigns, etc.)
        002_enhancements.sql          -- Email templates, signatures, warmup
        003_phone_calls.sql           -- phone_calls table + vapi system_settings
        004_vapi_settings_and_knowledge.sql -- vapi_knowledge_entries table + call script settings
      migrate.js                      -- Migration runner
    middleware/
      auth.js            -- JWT authentication middleware
      rateLimiter.js     -- Express rate limiting
      rbac.js            -- Role-based access control (requireRole)
    routes/
      abTests.js         -- A/B test CRUD
      aiAgent.js         -- AI monitoring agent status/trigger/logs
      aiChat.js          -- Admin AI chat (natural language commands)
      analytics.js       -- Dashboard analytics (funnel, timeline, heatmaps)
      auditLogs.js       -- Audit log listing/export
      auth.js            -- Login/logout/refresh/me
      brands.js          -- Brand CRUD
      campaigns.js       -- Campaign CRUD + start/pause/resume/cancel
      integrations.js    -- Google Sheets, webhooks, outbound integrations, API keys
      leads.js           -- Lead CRUD + CSV import + stats
      notifications.js   -- In-app notification listing
      phoneCalls.js      -- Phone call logs, agent settings, call script, knowledge base CRUD
      replies.js         -- Reply threads + send reply
      settings.js        -- System settings CRUD
      signatures.js      -- Email signature management
      smtp.js            -- SMTP account CRUD + health checks
      templates.js       -- Email template CRUD
      users.js           -- User CRUD (admin)
      vapiWebhook.js     -- Public Vapi webhook receiver (call status updates)
      webhookReceiver.js -- Public inbound lead webhook endpoint
    services/
      aiAgent.js         -- AI monitoring agent (scheduled health checks)
      aiProvider.js      -- Multi-provider AI abstraction (Claude/GPT/Gemini)
      apiKeys.js         -- Encrypted API key storage with DB-first + env fallback + cache
      audit.js           -- Audit logging service
      blacklistChecker.js -- Email blacklist checking
      emailGenerator.js  -- AI email content generation
      emailSender.js     -- SMTP/SendGrid/Mailgun email dispatch
      emailVerifier.js   -- Email address verification
      googleSheets.js    -- Google Sheets polling + lead import
      notifications.js   -- In-app notification creation
      replyTracker.js    -- IMAP reply monitoring
      vapiCallAgent.js   -- Phone call agent orchestrator (scan leads, initiate calls, sync results)
      vapiCaller.js      -- Low-level Vapi.ai HTTP client (initiate, status, webhook verify, build overrides)
      warmupManager.js   -- SMTP warmup manager
    utils/
      encryption.js      -- AES-256-GCM encrypt/decrypt for API keys
      logger.js          -- Winston logger
      settings.js        -- Shared getSetting(key) helper for system_settings table
      spintax.js         -- Spintax parser for email variation
      validators.js      -- Input validation helpers
    workers/
      emailWorker.js     -- Bull queue email worker
      schedulerWorker.js -- Cron scheduler (campaigns, health checks, AI agent, phone agent)
    index.js             -- Express app setup, route mounting, scheduler init

frontend/
  src/
    api/
      client.js          -- Axios API client with auth interceptors
    components/
      DarkModeToggle.jsx -- Dark mode switcher
      DataTable.jsx      -- Reusable data table component
      Layout.jsx         -- Main layout with sidebar navigation
      Modal.jsx          -- Reusable modal component
      Pagination.jsx     -- Pagination component
      StatusBadge.jsx    -- Status badge component
    contexts/
      AuthContext.jsx    -- Authentication context provider
    pages/
      AIAgent.jsx        -- AI monitoring agent dashboard
      AIChat.jsx         -- Admin AI chat interface
      Analytics.jsx      -- Analytics dashboard (funnel, timeline, heatmaps)
      AuditLogs.jsx      -- Audit log viewer with export
      Brands.jsx         -- Brand management
      CampaignDetail.jsx -- Single campaign detail view
      Campaigns.jsx      -- Campaign list + creation
      Dashboard.jsx      -- Main dashboard overview
      Integrations.jsx   -- Google Sheets, webhooks, outbound integrations, API keys (incl. VAPI)
      LeadDetail.jsx     -- Single lead detail view
      Leads.jsx          -- Lead list + CSV import
      Login.jsx          -- Login page
      PhoneCalls.jsx     -- Phone call logs, agent settings, call script editor, knowledge base
      Replies.jsx        -- Reply inbox with threaded conversations
      Settings.jsx       -- System settings (sending, AI, notifications, platform)
      SmtpAccounts.jsx   -- SMTP account management + health
      Templates.jsx      -- Email template editor
      Unsubscribe.jsx    -- Public unsubscribe page
      Users.jsx          -- User management (admin)
    App.jsx              -- Router configuration
    main.jsx             -- React entry point
```

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- An Anthropic API key (for AI features)

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env with your actual values:
#   - JWT_SECRET and JWT_REFRESH_SECRET (generate random strings)
#   - ENCRYPTION_KEY (64-char hex string for AES-256)
#   - ANTHROPIC_API_KEY
#   - ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
```

### 2. Start the stack

```bash
docker-compose up --build -d
```

This starts:
- **PostgreSQL** on port 5432
- **Redis** on port 6379
- **Backend API** on port 4000
- **Frontend** on port 3000
- **Nginx reverse proxy** on port 80

### 3. Run database migrations

```bash
docker-compose exec backend node src/db/migrate.js
```

### 4. Create the first admin user

```bash
docker-compose exec backend node seeds/admin.js
```

### 5. Access the dashboard

Open `http://localhost` (or `http://localhost:3000` directly) and log in with the admin credentials from your `.env`.

## Environment Variables

| Variable | Description | Default |
|----------|------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://coldaf:coldaf_password@postgres:5432/coldaf_db` |
| `DB_HOST` | Database host | `postgres` |
| `DB_PORT` | Database port | `5432` |
| `DB_NAME` | Database name | `coldaf_db` |
| `DB_USER` | Database user | `coldaf` |
| `DB_PASSWORD` | Database password | `coldaf_password` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `JWT_SECRET` | JWT signing secret | **(required)** |
| `JWT_REFRESH_SECRET` | Refresh token secret | **(required)** |
| `JWT_EXPIRY` | JWT token expiry | `8h` |
| `JWT_REFRESH_EXPIRY` | Refresh token expiry | `7d` |
| `ENCRYPTION_KEY` | AES-256 encryption key (64 hex chars) | **(required)** |
| `ANTHROPIC_API_KEY` | Claude API key | **(required for AI features)** |
| `PORT` | Backend server port | `4000` |
| `NODE_ENV` | Environment | `production` |
| `FRONTEND_URL` | Frontend origin for CORS | `http://localhost:3000` |
| `BACKEND_URL` | Backend base URL (used in webhook URLs) | `http://localhost:4000` |
| `ADMIN_EMAIL` | Initial admin email | `admin@coldaf.com` |
| `ADMIN_PASSWORD` | Initial admin password | `ChangeThisPassword123!` |
| `ADMIN_NAME` | Initial admin display name | `System Admin` |
| `SENDGRID_API_KEY` | SendGrid API key (optional) | -- |
| `MAILGUN_API_KEY` | Mailgun API key (optional) | -- |
| `MAILGUN_DOMAIN` | Mailgun sending domain (optional) | -- |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to Google service account JSON | -- |
| `UPLOAD_DIR` | File upload directory | `./uploads` |
| `VAPI_API_KEY` | Vapi.ai private key (also configurable via dashboard) | -- |
| `VAPI_PHONE_NUMBER_ID` | Vapi phone number ID (also configurable via dashboard) | -- |
| `VAPI_ASSISTANT_ID` | Default Vapi assistant ID (also configurable via dashboard) | -- |
| `VAPI_WEBHOOK_SECRET` | Secret for verifying Vapi webhook payloads (also configurable via dashboard) | -- |

**Note:** VAPI settings can be configured either via environment variables or through the dashboard at **Integrations > API Keys**. Dashboard settings take priority over env vars.

## VAPI Phone Call Configuration

The phone call agent automatically calls leads that come in through webhooks (e.g., Discord leads with phone numbers).

### Setup

1. **API Keys**: Go to **Integrations > API Keys** and enter your VAPI credentials:
   - VAPI API Key (from dashboard.vapi.ai)
   - VAPI Phone Number ID (the phone number to call from)
   - VAPI Assistant ID (the AI assistant to use)
   - VAPI Webhook Secret (for verifying callbacks)

2. **Call Script**: Go to **Phone Calls** page and expand the **Call Script** section:
   - **First Message Template**: Customize the opening message with variables like `{{leadName}}`, `{{projectDetails}}`, `{{industry}}`, `{{email}}`, `{{phone}}`
   - **System Prompt**: Write instructions for the AI calling agent (tone, goals, guidelines)

3. **Knowledge Base**: Expand the **Knowledge Base** section to add entries:
   - Add FAQ entries, product info, pricing details, company info
   - Each entry has a title and content
   - Toggle entries active/inactive
   - Active entries are injected into the AI assistant's context during calls

4. **Agent Settings**: Configure scanning behavior:
   - Source Filter (default: "discord")
   - Scan Interval (minutes)
   - Max Retries
   - Retry on No-Answer

### How it works

1. Leads arrive via webhooks (e.g., Discord bot integration)
2. Phone call agent scans for new leads with phone numbers matching the source filter
3. For each eligible lead, the agent:
   - Applies the custom first message template with lead data
   - Injects the system prompt + knowledge base into the assistant context
   - Initiates an outbound call via Vapi
4. Vapi sends status updates via webhook to `POST /api/vapi/webhook`
5. Call results (transcript, summary, recording) are stored and viewable in the dashboard

## Webhook System

### Inbound Webhooks (Lead Intake)

Create webhooks at **Integrations > Inbound Webhooks**. Each webhook gets:
- An auto-generated URL: `{BACKEND_URL}/api/webhook/leads/{endpoint_path}`
- A secret token for HMAC-SHA256 signature verification

External systems send leads to this URL:
```
POST https://your-domain.com/api/webhook/leads/wh_abc123...
Headers:
  X-Webhook-Signature: <HMAC-SHA256 of body using secret token>
  Content-Type: application/json
Body:
  { "full_name": "...", "email": "...", "phone": "...", ... }
```

Field mapping is configurable per webhook to map incoming JSON fields to lead fields.

### Outbound Integrations (Event Notifications)

Send platform events to external services:
- **Discord** -- Post to Discord webhook channels
- **Custom Webhook** -- POST to any URL
- **Google Sheets Export** -- Append data to Google Sheets

Supported triggers: reply_received, campaign_paused, smtp_degraded, smtp_failed, bounce_threshold, spam_threshold

## Development (without Docker)

### Backend

```bash
cd backend
npm install
# Ensure PostgreSQL and Redis are running locally
# Update .env with localhost connection strings
npm run migrate
npm run seed
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on port 5173 by default and proxies `/api` requests to the backend.

## API Endpoints

### Auth
- `POST /api/auth/login` -- Login
- `POST /api/auth/refresh` -- Refresh JWT token
- `POST /api/auth/logout` -- Logout
- `GET /api/auth/me` -- Get current user

### Users (Admin)
- `GET /api/users` -- List users
- `POST /api/users` -- Create user
- `PUT /api/users/:id` -- Update user
- `DELETE /api/users/:id` -- Deactivate user

### Brands (Admin)
- `GET /api/brands` -- List brands
- `POST /api/brands` -- Create brand
- `PUT /api/brands/:id` -- Update brand
- `DELETE /api/brands/:id` -- Deactivate brand

### SMTP Accounts (Admin)
- `GET /api/smtp` -- List accounts
- `GET /api/smtp/health-summary` -- Health summary
- `POST /api/smtp` -- Create account
- `PUT /api/smtp/:id` -- Update account
- `POST /api/smtp/:id/health-check` -- Trigger health check
- `DELETE /api/smtp/:id` -- Deactivate account

### Leads
- `GET /api/leads` -- List leads (filterable)
- `GET /api/leads/stats` -- Lead statistics
- `GET /api/leads/:id` -- Lead detail
- `POST /api/leads` -- Create lead
- `PUT /api/leads/:id` -- Update lead
- `POST /api/leads/import-csv` -- CSV import (preview + confirm)

### Campaigns (Admin)
- `GET /api/campaigns` -- List campaigns
- `GET /api/campaigns/:id` -- Campaign detail
- `POST /api/campaigns` -- Create campaign
- `PUT /api/campaigns/:id` -- Update campaign
- `POST /api/campaigns/:id/start` -- Start campaign
- `POST /api/campaigns/:id/pause` -- Pause campaign
- `POST /api/campaigns/:id/resume` -- Resume campaign
- `POST /api/campaigns/:id/cancel` -- Cancel campaign
- `GET /api/campaigns/:id/leads` -- Campaign leads

### Analytics
- `GET /api/analytics/overview` -- Dashboard overview
- `GET /api/analytics/funnel` -- Funnel metrics
- `GET /api/analytics/timeline` -- Timeline data
- `GET /api/analytics/campaigns` -- Per-campaign breakdown
- `GET /api/analytics/brands` -- Per-brand breakdown
- `GET /api/analytics/smtp-performance` -- SMTP performance
- `GET /api/analytics/send-time-heatmap` -- Send time heatmap
- `GET /api/analytics/top-subjects` -- Top subject lines
- `GET /api/analytics/response-times` -- Response time stats
- `GET /api/analytics/compare` -- Period comparison

### Replies
- `GET /api/replies` -- List replies
- `GET /api/replies/unread-count` -- Unread count
- `GET /api/replies/thread/:leadId` -- Thread messages
- `PUT /api/replies/:id/read` -- Mark as read
- `PUT /api/replies/mark-all-read` -- Mark all read
- `POST /api/replies/send` -- Send reply

### A/B Tests
- `POST /api/ab-tests` -- Create test
- `PUT /api/ab-tests/:id/winner` -- Declare winner

### Integrations (Admin)
- `GET /api/integrations/sheets` -- Google Sheet connections
- `POST /api/integrations/sheets` -- Add sheet connection
- `PUT /api/integrations/sheets/:id` -- Update connection
- `DELETE /api/integrations/sheets/:id` -- Remove connection
- `POST /api/integrations/sheets/:id/test` -- Test connection
- `GET /api/integrations/webhooks` -- Webhook sources (with full endpoint URLs)
- `POST /api/integrations/webhooks` -- Create webhook (returns URL + secret)
- `PUT /api/integrations/webhooks/:id` -- Update webhook
- `DELETE /api/integrations/webhooks/:id` -- Delete webhook
- `GET /api/integrations/webhooks/:id/events` -- Webhook events
- `GET /api/integrations/outbound` -- Outbound integrations
- `POST /api/integrations/outbound` -- Create outbound
- `PUT /api/integrations/outbound/:id` -- Update outbound
- `POST /api/integrations/outbound/:id/test` -- Test outbound
- `GET /api/integrations/api-keys` -- View API keys (masked) -- includes VAPI keys
- `PUT /api/integrations/api-keys` -- Update API keys -- includes VAPI keys

### AI Chat (Admin)
- `GET /api/ai/chat/history` -- Chat history
- `POST /api/ai/chat/message` -- Send message
- `POST /api/ai/chat/confirm-action` -- Confirm proposed action
- `DELETE /api/ai/chat/history` -- Clear history

### AI Agent (Admin)
- `GET /api/ai/agent/status` -- Agent status
- `GET /api/ai/agent/logs` -- Agent activity logs
- `POST /api/ai/agent/trigger` -- Trigger manual check
- `PUT /api/ai/agent/settings` -- Update agent settings

### Settings (Admin)
- `GET /api/settings` -- Get all settings
- `PUT /api/settings` -- Update settings

### Audit Logs (Admin)
- `GET /api/audit-logs` -- List logs (filterable)
- `GET /api/audit-logs/action-types` -- Available action types
- `GET /api/audit-logs/export` -- Export as CSV

### Notifications
- `GET /api/notifications` -- List notifications
- `GET /api/notifications/unread-count` -- Unread count
- `PUT /api/notifications/:id/read` -- Mark as read
- `PUT /api/notifications/read-all` -- Mark all read

### Tracking (Public)
- `GET /api/track/open/:emailId` -- Open tracking pixel
- `GET /api/track/click/:emailId` -- Click tracking redirect
- `GET /unsubscribe/:leadId` -- Unsubscribe page

### Webhooks (Public)
- `POST /api/webhook/leads/:endpointPath` -- Inbound lead webhook

### Phone Calls (Admin)
- `GET /api/phone-calls` -- List calls (filterable by status, lead_id)
- `GET /api/phone-calls/stats` -- Call statistics
- `GET /api/phone-calls/:id` -- Single call detail
- `POST /api/phone-calls/trigger` -- Trigger agent scan for leads
- `POST /api/phone-calls/sync` -- Sync in-flight call statuses from Vapi
- `POST /api/phone-calls/call-lead/:leadId` -- Manually call a specific lead
- `GET /api/phone-calls/agent/status` -- Agent settings/status
- `PUT /api/phone-calls/agent/settings` -- Update agent settings
- `GET /api/phone-calls/agent/call-script` -- Get call script settings
- `PUT /api/phone-calls/agent/call-script` -- Update call script settings
- `GET /api/phone-calls/knowledge` -- List knowledge base entries
- `POST /api/phone-calls/knowledge` -- Create knowledge entry
- `PUT /api/phone-calls/knowledge/:id` -- Update knowledge entry
- `DELETE /api/phone-calls/knowledge/:id` -- Delete knowledge entry

### Vapi Webhook (Public)
- `POST /api/vapi/webhook` -- Vapi call status updates (end-of-call reports)

### Health
- `GET /api/health` -- Health check

## Architecture

```
+----------------+     +----------------+     +----------------+
|    Nginx       |---->|   Frontend     |     |   Browser      |
|  (port 80)     |     |  (port 3000)   |<----|                |
+-------+--------+     +----------------+     +----------------+
        |
        v
+-------+--------+     +----------------+     +----------------+
|   Backend      |---->|  PostgreSQL    |     |    Redis       |
|  (port 4000)   |     |  (port 5432)   |     | (port 6379)    |
+-------+--------+     +----------------+     +-------+--------+
        |                                             |
        +--- Email Worker (Bull queue) ---------------+
        +--- Reply Tracker (IMAP polling)
        +--- Sheets Worker (Google Sheets polling)
        +--- SMTP Health Checker (cron)
        +--- AI Agent (scheduled checks)
        +--- Phone Call Agent (Vapi.ai, scheduled + webhook)
```

### API Key Management

All API keys (Anthropic, OpenAI, Gemini, SendGrid, Mailgun, VAPI) are stored encrypted (AES-256-GCM) in the `system_settings` table. The system checks DB first, then falls back to environment variables. Keys are cached in memory with a 5-minute TTL.

### Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Admin and sales users |
| `brands` | Brand configurations |
| `smtp_accounts` | SMTP account credentials and health |
| `leads` | All leads from all sources |
| `campaigns` | Campaign definitions and status |
| `campaign_leads` | Many-to-many campaign/lead assignments |
| `emails` | Sent email records with tracking |
| `email_templates` | Reusable email templates |
| `email_signatures` | Email signatures per brand |
| `ab_tests` / `ab_test_variants` | A/B test configurations |
| `replies` | Tracked email replies |
| `phone_calls` | Vapi call records (transcript, summary, recording) |
| `vapi_knowledge_entries` | Knowledge base entries for AI calling agent |
| `webhook_sources` | Inbound webhook configurations |
| `webhook_events` | Inbound webhook event logs |
| `outbound_integrations` | Outbound integration configs (Discord, custom, Sheets) |
| `google_sheet_connections` | Google Sheets import configs |
| `system_settings` | Key-value settings (all config, API keys, agent settings) |
| `audit_logs` | Full audit trail |
| `notifications` | In-app notifications |

## License

Proprietary. All rights reserved.
