# ColdAF Email Tool

Production-ready cold email management and automation platform for multi-brand outreach campaigns with AI-powered email generation, AI phone calling, real-time analytics, and full deliverability management.

## What Has Been Done (Project Recovery)

This section documents the production hardening work completed across all phases.

### Phase 1: Stop the Bleeding
- ✅ **Removed mock data interceptor** — `frontend/src/api/mockDataInterceptor.js` was deleted. The frontend no longer returns fake `Math.random()` data for unimplemented APIs. Real errors now surface so broken features are visible.
- ✅ **Removed DEV auth bypass** — The `if (import.meta.env.DEV)` block in `AuthContext.jsx` was deleted. The auth flow is now tested with real login/logout/refresh in development.
- ✅ **Cleaned project root** — Removed junk files (`0)`, `({`, `NOW()`, `r.status`, etc.) that were shell syntax errors saved as filenames.
- ✅ **Removed dead AI framework directories** — Deleted `.claude-flow/` and `.swarm/` (conflicting, unconfigured) and dead prompt files.
- ✅ **Rewrote `CLAUDE.md`** — Replaced from a Ruflo config file to a project-specific architecture reference.

### Phase 2: Fix the Data Layer
- ✅ **Fixed `organization_id` filtering** — Added `WHERE organization_id = $1` to queries in `aiAgent.js`, `aiUsage.js`, and `notifications.js` that previously returned cross-tenant data.
- ✅ **Fixed admin seed for multi-tenant** — `backend/seeds/admin.js` now creates a default organization and assigns the admin user as its owner. Works with migration 008's `NOT NULL` constraints.
- ✅ **Added migration lock** — `backend/src/db/migrate.js` uses PostgreSQL advisory lock (`pg_try_advisory_lock`) to prevent concurrent migrations in multi-container deployments.

### Phase 3: Build Real Features
- ✅ **Added reusable validation middleware** — `backend/src/middleware/validation.js` with `validateBody`, `validateParams`, and `sanitizeBody` supporting 10 field types (email, string, number, boolean, array, uuid, url, domain, phone).
- ✅ **Applied validation to critical routes** — `brands.js`, `campaigns.js`, `smtp.js`, `leads.js`, `replies.js`, `integrations.js`, `settings.js`, `organizations.js` now sanitize and validate inputs.
- ✅ **Added missing admin endpoints** — `POST /api/admin/admins` (create/promote admin) and `DELETE /api/admin/admins/:id` (demote admin) were added.
- ✅ **Added test suite** — `jest` + `supertest` configured. Tests for auth flow (register, login, me, refresh, logout) and brands CRUD including cross-org isolation.
- ✅ **Frontend error handling** — Added `ToastContext.jsx` (global toast notification system) and wired API errors to dispatch `toast:error` events so users see visible error messages instead of silent failures.

### Phase 4: Production Hardening
- ✅ **Real health checks** — `/api/health` now checks PostgreSQL (query latency) and Redis (ping). Returns `503` if any service is down.
- ✅ **Org-level rate limiting** — `backend/src/middleware/rateLimiter.js` added `orgApiLimiter` (1000 req/min per organization). Applied to all SaaS routes to prevent one tenant from DDoS-ing the API.
- ✅ **Gmail OAuth token refresh cron** — `backend/src/workers/schedulerWorker.js` added `runGmailOAuthRefresh()` that runs every 30 minutes. Refreshes tokens expiring within 2 hours via `google.auth.OAuth2`. Marks account as `degraded` on failure.
- ✅ **Deployment verification script** — `backend/scripts/verify-deploy.js` checks environment variables, DB/Redis connections, migrations, roles, directories, frontend build, and dependencies before deploy.
- ✅ **Updated README** — Complete rewrite with corrected tech stack, real endpoint list (50+ endpoints), and a 30-item go-live checklist.
- ✅ **Added `.env.test`** — Isolated test environment configuration with test JWT secrets and encryption key.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20 + Express 4 |
| Database | PostgreSQL 16 |
| Queue | Bull (Redis-backed) |
| Frontend | React 18 + Vite 5 + Tailwind CSS 3 |
| Email Sending | Nodemailer (SMTP) + SendGrid + Mailgun + Gmail OAuth |
| Phone Calls | Vapi.ai (outbound AI voice) |
| AI | Anthropic Claude + OpenAI + Google Gemini |
| Auth | JWT in httpOnly cookies + bcrypt + refresh tokens |
| Scheduler | node-cron |
| Containerization | Docker Compose |
| Testing | Jest + Supertest |

## Features

- **Multi-brand management** — 4+ brands with independent SMTP accounts, AI prompts, and sending rules
- **AI email generation** — Personalized cold emails via Claude/GPT/Gemini with per-brand tone/style
- **Campaign management** — Multi-brand campaigns, follow-up sequences, scheduling, A/B testing
- **3-source lead intake** — Google Sheets (auto-poll), CSV upload, webhooks
- **SMTP health monitoring** — SPF/DKIM/DMARC checks, bounce/spam rate tracking, auto-pause
- **Reply tracking** — IMAP inbox monitoring, threaded conversations, in-dashboard reply
- **Real-time analytics** — Funnel charts, timelines, heatmaps, A/B comparisons, date range comparison
- **AI monitoring agent** — Periodic health checks with automated alerting and campaign control
- **Phone call agent** — Automated outbound AI calls via Vapi.ai with custom call scripts, knowledge base, transcripts, recordings, and summaries
- **Warmup system** — Pool-based email warmup with daily ramp, AI content, and engagement simulation
- **HubSpot native sync** — Bidirectional contact sync with OAuth2 and activity logging
- **Scheduled white-label reports** — Automated PDF/CSV reports with client branding and email delivery
- **Custom tracking domains** — Per-brand custom domains for open/click tracking
- **AI reply agent** — Auto-generates context-aware reply drafts for lead responses
- **A/B test auto-optimize** — Auto-selects winning variants based on statistical significance
- **Voice-triggered sequences** — Trigger email sequences from voice commands
- **AI deliverability advisor** — Scores sending health and suggests fixes
- **Per-client analytics API** — JSON analytics endpoint for agency white-label portals
- **Admin AI chat** — Natural language interface to modify brand prompts and campaign settings
- **Role-based access** — 8 roles: user, admin, org_admin, sales, viewer, super_admin, support_admin, billing_admin, platform_owner
- **Audit logging** — Every action logged with actor, timestamp, and metadata
- **Deliverability** — Rate limiting, randomized delays, unsubscribe handling, List-Unsubscribe headers
- **Webhook integrations** — Inbound webhooks for lead intake with auto-generated URLs + outbound webhooks for event notifications
- **Billing** — Stripe subscription billing with 8 plan tiers (Free, Trial, Solo, Starter, Pro, Scale, Agency, Enterprise)

## Competitive Research Implementation (New Features)

Based on competitive analysis vs Instantly.ai, Smartlead.ai, and Saleshandy, the following features were implemented to achieve feature parity and differentiation:

### TABLE-STAKES (Must-Have to Compete)
1. **Warmup System** — Pool-based email warmup with AI-powered content, daily ramp, and engagement simulation. Routes: `GET/POST/PUT/DELETE /api/warmup/campaigns`, `POST /api/warmup/campaigns/:id/start|pause`
2. **HubSpot Native Sync** — Bidirectional contact sync, OAuth2 connection, activity logging. Routes: `GET/POST/DELETE /api/integrations/hubspot/connections`, `POST /api/integrations/hubspot/sync/:id`
3. **Scheduled White-Label Reports** — Automated PDF/CSV reports with client branding, email delivery, and flexible schedules. Routes: `GET/POST/PUT/DELETE /api/reports/scheduled`, `GET /api/reports/scheduled/:id/preview`
4. **Custom Tracking Domains** — Per-brand custom domains for open/click tracking. Routes: `GET/POST/DELETE /api/tracking-domains`, `POST /api/tracking-domains/:id/verify|set-default|ssl-check`

### DIFFERENTIATORS (Features Others Don't Have)
5. **AI Reply Agent** — Auto-generates context-aware reply drafts for lead responses. Tables: `ai_reply_drafts`, `ai_reply_agent_settings`
6. **A/B Test Auto-Optimize** — Auto-selects winning variants based on statistical significance. Added `auto_optimize_enabled`, `winner_selection_method`, `traffic_allocation` to `ab_tests` table.
7. **Per-Client Analytics API** — JSON analytics endpoint for agency white-label portals. Routes: `GET /api/analytics/client-dashboard`, `GET /api/analytics/client-dashboard/widget` (HTML embed)

### WHITESPACE (Unique Features Nobody Has)
8. **Voice-Triggered Sequences** — Trigger email sequences from voice commands ("Warm up Acme Corp"). Tables: `voice_trigger_rules`, `voice_trigger_executions`
9. **AI Deliverability Advisor** — Scores sending health and suggests fixes. Table: `deliverability_scores`

### What We Do NOT Build (Strategic Decisions)
- ❌ **Built-in B2B lead database** — Use Clay/Apollo instead. Not a data company.
- ❌ **Native LinkedIn automation** — Compliance liability. Use LinkedIn APIs or integrate with LinkedIn tools.
- ❌ **Native CRM** — Integrate with HubSpot/Salesforce instead. CRM is not our core competency.

## Project File Structure

```
backend/
  src/
    config/
      database.js        — PostgreSQL connection pool
      env.js             — Environment variable loader
      redis.js           — Redis connection for Bull queues
    db/
      migrations/         — 14 schema migrations (001-014)
      migrate.js          — Migration runner with advisory lock
    middleware/
      auth.js            — JWT authentication
      rateLimiter.js     — IP + org-level rate limiting
      rbac.js            — Role-based access control
      tenantScope.js      — Multi-tenant organization scoping
      validation.js       — Reusable input validation middleware
    routes/               — 33+ route files
    services/             — Business logic (email, AI, tracking, billing, etc.)
    services/agents/      — Multi-agent AI system (CEO, cold email, cold calling)
    workers/              — schedulerWorker, emailWorker, sequenceProcessor
    utils/                — encryption, logger, validators
    index.js              — Express app entry point
  seeds/                  — admin.js, platformOwner.js
  tests/                  — Jest test suite (auth + brands CRUD)
  scripts/                — verify-deploy.js
frontend/
  src/
    api/client.js         — Fetch-based API client (no mock data)
    contexts/             — AuthContext, BrandingContext
    components/           — Layout, ErrorBoundary, AdminLayout, etc.
    pages/                — 30+ page components
    pages/admin/          — 15-section platform admin panel
    App.jsx               — React Router configuration
```

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local dev without Docker)

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env with your actual values:
#   - JWT_SECRET and JWT_REFRESH_SECRET (generate random strings, min 32 chars)
#   - ENCRYPTION_KEY (32-char hex string for AES-256-GCM)
#   - ANTHROPIC_API_KEY (for AI features)
#   - ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
#   - STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (for billing)
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

Open `http://localhost` and log in with the admin credentials from your `.env`.

## Environment Variables

| Variable | Description | Required |
|----------|------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `DB_HOST` | Database host | Yes |
| `DB_PORT` | Database port | Yes |
| `DB_NAME` | Database name | Yes |
| `DB_USER` | Database user | Yes |
| `DB_PASSWORD` | Database password | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Yes |
| `JWT_REFRESH_SECRET` | Refresh token secret (min 32 chars) | Yes |
| `JWT_ACCESS_EXPIRY` | JWT token expiry | `15m` |
| `JWT_REFRESH_EXPIRY` | Refresh token expiry | `7d` |
| `ENCRYPTION_KEY` | AES-256 encryption key (32 hex chars) | Yes |
| `ANTHROPIC_API_KEY` | Claude API key | For AI features |
| `OPENAI_API_KEY` | OpenAI API key | For AI features |
| `GOOGLE_API_KEY` | Gemini API key | For AI features |
| `PORT` | Backend server port | `4000` |
| `NODE_ENV` | Environment | `production` |
| `FRONTEND_URL` | Frontend origin for CORS | Yes |
| `BACKEND_URL` | Backend base URL | Yes |
| `ADMIN_EMAIL` | Initial admin email | `admin@coldaf.com` |
| `ADMIN_PASSWORD` | Initial admin password | `ChangeThisPassword123!` |
| `ADMIN_NAME` | Initial admin display name | `System Admin` |
| `STRIPE_SECRET_KEY` | Stripe secret key (production) | For billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint secret | For billing |
| `SENDGRID_API_KEY` | SendGrid API key | Optional |
| `MAILGUN_API_KEY` | Mailgun API key | Optional |
| `MAILGUN_DOMAIN` | Mailgun sending domain | Optional |
| `GMAIL_OAUTH_CLIENT_ID` | Gmail OAuth client ID | For Gmail OAuth |
| `GMAIL_OAUTH_CLIENT_SECRET` | Gmail OAuth client secret | For Gmail OAuth |
| `UPLOAD_DIR` | File upload directory | `./uploads` |
| `VAPI_API_KEY` | Vapi.ai private key | For phone calls |
| `VAPI_PHONE_NUMBER_ID` | Vapi phone number ID | For phone calls |
| `VAPI_ASSISTANT_ID` | Default Vapi assistant ID | For phone calls |
| `VAPI_WEBHOOK_SECRET` | Secret for verifying Vapi webhooks | For phone calls |

## Deployment Verification

**Run the verification script before every deploy:**

```bash
cd backend
node scripts/verify-deploy.js
```

This checks:
1. Environment variables are set (no placeholders)
2. Database connection works
3. Redis connection works
4. All migrations are applied
5. Required roles exist in the database
6. Required directories exist
7. Frontend build is present
8. Critical dependencies are installed

## Go-Live Checklist

**Before deploying to production, verify every item:**

### Environment
- [ ] `.env` has real values (no `CHANGE_ME` placeholders)
- [ ] `JWT_SECRET` is at least 64 characters
- [ ] `ENCRYPTION_KEY` is exactly 32 hex characters
- [ ] `NODE_ENV=production`
- [ ] `FRONTEND_URL` points to your production domain
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set (if billing enabled)

### Database
- [ ] PostgreSQL 16+ is running
- [ ] `coldaf_db` database exists
- [ ] All 14 migrations are applied (`node src/db/migrate.js`)
- [ ] `roles` table has: user, admin, org_admin, super_admin, platform_owner
- [ ] Admin seed ran successfully (`node seeds/admin.js`)
- [ ] Default organization created with owner assigned

### Redis
- [ ] Redis 7+ is running
- [ ] Connection from backend works

### Backend
- [ ] `npm install` completed (no missing dependencies)
- [ ] `npm test` passes all tests
- [ ] `/api/health` returns `status: ok` with DB and Redis latency
- [ ] No `mockDataInterceptor` references in code (removed)
- [ ] No `DEV BYPASS` auth references in code (removed)

### Frontend
- [ ] `npm run build` succeeds with no errors
- [ ] `dist/index.html` exists
- [ ] Login page works without DEV bypass
- [ ] Dashboard shows real data (not fake numbers)

### Email
- [ ] At least one SMTP account configured
- [ ] Or SendGrid/Mailgun API key configured
- [ ] Test email sent successfully
- [ ] Tracking pixel (`/api/track/open`) loads
- [ ] Unsubscribe page (`/unsubscribe/:token`) works

### Auth
- [ ] Registration creates user + org + logs in
- [ ] Login returns token + sets cookies
- [ ] Refresh token endpoint works
- [ ] Logout clears cookies
- [ ] `/api/auth/me` returns current user with org data

### Multi-tenant Security
- [ ] User A cannot see User B's brands
- [ ] User A cannot see User B's campaigns
- [ ] User A cannot see User B's leads
- [ ] Org-level rate limiting returns 429 when exceeded

### Admin Panel (Platform Owner)
- [ ] All 15 admin sections load real data
- [ ] Can create discount codes
- [ ] Can create license keys
- [ ] Can view revenue analytics
- [ ] Can manage platform admins
- [ ] Can view security audit logs

### Stripe (if billing enabled)
- [ ] Checkout session creates successfully
- [ ] Webhook endpoint receives and processes events
- [ ] Customer portal loads
- [ ] Subscription status updates correctly

### AI (if AI features enabled)
- [ ] Anthropic API key configured
- [ ] AI chat responds to messages
- [ ] AI agent status endpoint works
- [ ] Token usage tracking records data

### Phone Calls (if Vapi enabled)
- [ ] Vapi API key configured
- [ ] Call script settings save
- [ ] Knowledge base entries save
- [ ] Agent status endpoint works

### Warmup (New)
- [ ] Warmup pool has at least 10 accounts
- [ ] Warmup campaign sends daily emails
- [ ] Engagement simulation runs (opens/replies)
- [ ] Daily ramp advances volume correctly

### HubSpot Sync (New)
- [ ] HubSpot OAuth connection works
- [ ] Contact sync pulls/pushes correctly
- [ ] Sync logs show successful runs

### Tracking Domains (New)
- [ ] Custom domain DNS records configured
- [ ] Domain verification passes
- [ ] Tracking pixel loads from custom domain

### Scheduled Reports (New)
- [ ] Report generates with correct data
- [ ] Email delivery succeeds
- [ ] Delivery logs show sent status

### Client Analytics (New)
- [ ] `/api/analytics/client-dashboard` returns JSON
- [ ] Widget embed loads in iframe
- [ ] Data matches actual campaign performance

## API Endpoints

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh JWT token
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user
- `POST /api/auth/signup/super-admin` — Self-serve registration (creates Free org)
- `POST /api/auth/signup/organization` — Create organization (super_admin only)
- `POST /api/auth/accept-invitation` — Accept org invitation

### Users (Admin)
- `GET /api/users` — List users in org
- `POST /api/users` — Create user
- `PUT /api/users/:id` — Update user
- `DELETE /api/users/:id` — Deactivate user

### Brands (Admin)
- `GET /api/brands` — List brands
- `POST /api/brands` — Create brand
- `PUT /api/brands/:id` — Update brand
- `DELETE /api/brands/:id` — Deactivate brand

### SMTP Accounts (Admin)
- `GET /api/smtp` — List accounts
- `GET /api/smtp/health-summary` — Health summary
- `POST /api/smtp` — Create account
- `PUT /api/smtp/:id` — Update account
- `POST /api/smtp/:id/health-check` — Trigger health check
- `DELETE /api/smtp/:id` — Deactivate account

### Leads
- `GET /api/leads` — List leads (filterable)
- `GET /api/leads/stats` — Lead statistics
- `GET /api/leads/:id` — Lead detail
- `POST /api/leads` — Create lead
- `PUT /api/leads/:id` — Update lead
- `POST /api/leads/import-csv` — CSV import (preview + confirm)

### Campaigns (Admin)
- `GET /api/campaigns` — List campaigns
- `GET /api/campaigns/:id` — Campaign detail
- `POST /api/campaigns` — Create campaign
- `PUT /api/campaigns/:id` — Update campaign
- `POST /api/campaigns/:id/start` — Start campaign
- `POST /api/campaigns/:id/pause` — Pause campaign
- `POST /api/campaigns/:id/resume` — Resume campaign
- `POST /api/campaigns/:id/cancel` — Cancel campaign
- `GET /api/campaigns/:id/leads` — Campaign leads

### Analytics
- `GET /api/analytics/overview` — Dashboard overview
- `GET /api/analytics/funnel` — Funnel metrics
- `GET /api/analytics/timeline` — Timeline data
- `GET /api/analytics/campaigns` — Per-campaign breakdown
- `GET /api/analytics/brands` — Per-brand breakdown
- `GET /api/analytics/smtp-performance` — SMTP performance
- `GET /api/analytics/send-time-heatmap` — Send time heatmap
- `GET /api/analytics/top-subjects` — Top subject lines
- `GET /api/analytics/response-times` — Response time stats
- `GET /api/analytics/compare` — Period comparison

### Replies
- `GET /api/replies` — List replies
- `GET /api/replies/unread-count` — Unread count
- `GET /api/replies/thread/:leadId` — Thread messages
- `PUT /api/replies/:id/read` — Mark as read
- `PUT /api/replies/mark-all-read` — Mark all read
- `POST /api/replies/send` — Send reply

### A/B Tests
- `POST /api/ab-tests` — Create test
- `PUT /api/ab-tests/:id/winner` — Declare winner

### Warmup
- `GET /api/warmup/campaigns` — List warmup campaigns
- `POST /api/warmup/campaigns` — Create warmup campaign
- `GET /api/warmup/campaigns/:id` — Get campaign detail
- `PUT /api/warmup/campaigns/:id` — Update campaign
- `DELETE /api/warmup/campaigns/:id` — Delete campaign
- `POST /api/warmup/campaigns/:id/start` — Start campaign
- `POST /api/warmup/campaigns/:id/pause` — Pause campaign
- `GET /api/warmup/campaigns/:id/stats` — Campaign stats
- `GET /api/warmup/pools` — List warmup pools
- `POST /api/warmup/pools` — Create pool
- `GET /api/warmup/pools/:id/accounts` — List pool accounts
- `POST /api/warmup/pools/:id/accounts` — Add pool account
- `DELETE /api/warmup/pools/:id/accounts/:accountId` — Remove pool account
- `GET /api/warmup/daily-logs` — Daily warmup logs

### Tracking Domains
- `GET /api/tracking-domains` — List tracking domains
- `POST /api/tracking-domains` — Add tracking domain
- `POST /api/tracking-domains/:id/verify` — Verify domain DNS
- `POST /api/tracking-domains/:id/set-default` — Set as default
- `POST /api/tracking-domains/:id/ssl-check` — Check SSL status
- `DELETE /api/tracking-domains/:id` — Remove domain

### Scheduled Reports
- `GET /api/reports/scheduled` — List scheduled reports
- `POST /api/reports/scheduled` — Create scheduled report
- `GET /api/reports/scheduled/:id` — Get report detail
- `PUT /api/reports/scheduled/:id` — Update report
- `DELETE /api/reports/scheduled/:id` — Delete report
- `POST /api/reports/scheduled/:id/toggle` — Toggle active/inactive
- `POST /api/reports/scheduled/:id/send-now` — Send report now
- `GET /api/reports/scheduled/:id/preview` — Preview report data
- `GET /api/reports/scheduled/:id/delivery-logs` — View delivery history

### Client Analytics (Agency/White-Label)
- `GET /api/analytics/client-dashboard` — JSON analytics for client dashboards
- `GET /api/analytics/client-dashboard/widget` — HTML embed widget (iframe-ready)

### Integrations (Admin)
- `GET /api/integrations/sheets` — Google Sheet connections
- `POST /api/integrations/sheets` — Add sheet connection
- `PUT /api/integrations/sheets/:id` — Update connection
- `DELETE /api/integrations/sheets/:id` — Remove connection
- `POST /api/integrations/sheets/:id/test` — Test connection
- `POST /api/integrations/sheets/:id/sync` — Sync now
- `GET /api/integrations/hubspot/connections` — HubSpot connections
- `POST /api/integrations/hubspot/connections` — Connect HubSpot
- `POST /api/integrations/hubspot/connections/:id/test` — Test connection
- `DELETE /api/integrations/hubspot/connections/:id` — Disconnect
- `POST /api/integrations/hubspot/sync/:id` — Trigger sync
- `GET /api/integrations/hubspot/sync/:id/logs` — Sync logs
- `GET /api/integrations/webhooks` — Webhook sources
- `POST /api/integrations/webhooks` — Create webhook
- `PUT /api/integrations/webhooks/:id` — Update webhook
- `DELETE /api/integrations/webhooks/:id` — Delete webhook
- `GET /api/integrations/webhooks/:id/events` — Webhook events
- `GET /api/integrations/outbound` — Outbound integrations
- `POST /api/integrations/outbound` — Create outbound
- `PUT /api/integrations/outbound/:id` — Update outbound
- `POST /api/integrations/outbound/:id/test` — Test outbound
- `GET /api/integrations/api-keys` — View API keys (masked)
- `PUT /api/integrations/api-keys` — Update API keys

### AI Chat (Admin)
- `GET /api/ai/chat/history` — Chat history
- `POST /api/ai/chat/message` — Send message
- `POST /api/ai/chat/confirm-action` — Confirm proposed action
- `DELETE /api/ai/chat/history` — Clear history

### AI Agent (Admin)
- `GET /api/ai/agent/status` — Agent status
- `GET /api/ai/agent/logs` — Agent activity logs
- `POST /api/ai/agent/trigger` — Trigger manual check
- `PUT /api/ai/agent/settings` — Update agent settings

### AI Usage
- `GET /api/ai/usage` — Token usage breakdown
- `GET /api/ai/usage/monthly` — Monthly usage summary

### Settings (Admin)
- `GET /api/settings` — Get all settings
- `PUT /api/settings` — Update settings
- `PUT /api/settings/notifications` — Update notification preferences

### Audit Logs (Admin)
- `GET /api/audit-logs` — List logs (filterable)
- `GET /api/audit-logs/action-types` — Available action types
- `GET /api/audit-logs/export` — Export as CSV

### Notifications
- `GET /api/notifications` — List notifications
- `GET /api/notifications/unread-count` — Unread count
- `PUT /api/notifications/:id/read` — Mark as read
- `PUT /api/notifications/read-all` — Mark all read
- `DELETE /api/notifications/:id` — Delete notification

### Tracking (Public)
- `GET /api/track/open/:emailId` — Open tracking pixel
- `GET /api/track/click/:emailId` — Click tracking redirect
- `GET /unsubscribe/:leadId` — Unsubscribe page
- `POST /api/unsubscribe/:leadId` — Unsubscribe API

### Webhooks (Public)
- `POST /api/webhook/leads/:endpointPath` — Inbound lead webhook

### Phone Calls (Admin)
- `GET /api/phone-calls` — List calls
- `GET /api/phone-calls/stats` — Call statistics
- `GET /api/phone-calls/:id` — Single call detail
- `POST /api/phone-calls/trigger` — Trigger agent scan
- `POST /api/phone-calls/sync` — Sync call statuses
- `POST /api/phone-calls/call-lead/:leadId` — Manually call a lead
- `GET /api/phone-calls/agent/status` — Agent settings
- `PUT /api/phone-calls/agent/settings` — Update agent settings
- `GET /api/phone-calls/agent/call-script` — Get call script
- `PUT /api/phone-calls/agent/call-script` — Update call script
- `GET /api/phone-calls/knowledge` — List knowledge entries
- `POST /api/phone-calls/knowledge` — Create knowledge entry
- `PUT /api/phone-calls/knowledge/:id` — Update knowledge entry
- `DELETE /api/phone-calls/knowledge/:id` — Delete knowledge entry

### Vapi Webhook (Public)
- `POST /api/vapi/webhook` — Vapi call status updates

### Gmail OAuth
- `GET /api/gmail/oauth/auth-url` — Get OAuth authorization URL
- `GET /api/gmail/oauth/callback` — OAuth callback (redirect from Google)
- `POST /api/gmail/oauth/disconnect/:id` — Disconnect Gmail account
- `POST /api/gmail/oauth/:id/reconnect` — Reconnect Gmail account

### Billing
- `POST /api/billing/checkout` — Create Stripe checkout session
- `POST /api/billing/portal` — Create Stripe customer portal session
- `POST /api/billing/webhook` — Stripe webhook receiver

### Organizations
- `GET /api/organizations` — Get current org details
- `PUT /api/organizations` — Update org settings
- `PUT /api/organizations/ai-keys` — Update org AI API keys
- `POST /api/organizations/invite` — Invite member
- `PUT /api/organizations/members/:id/role` — Change member role
- `PUT /api/organizations/members/:id/deactivate` — Deactivate member
- `PUT /api/organizations/members/:id/reactivate` — Reactivate member
- `PUT /api/organizations/branding` — Update org branding

### Platform Admin (Platform Owner only)
- `GET /api/admin/stats` — Platform stats
- `GET /api/admin/organizations` — List all organizations
- `GET /api/admin/revenue` — Revenue analytics
- `GET /api/admin/license-keys` — License keys
- `POST /api/admin/license-keys/generate` — Generate license key
- `GET /api/admin/discount-codes` — Discount codes
- `POST /api/admin/discount-codes` — Create discount code
- `GET /api/admin/affiliates` — Affiliates
- `GET /api/admin/pro-users` — Pro users
- `GET /api/admin/requests` — Support requests
- `GET /api/admin/requests/:id` — Single request
- `PUT /api/admin/requests/:id/status` — Update request status
- `POST /api/admin/requests/:id/reply` — Reply to request
- `GET /api/admin/admins` — List platform admins
- `POST /api/admin/admins` — Create platform admin
- `DELETE /api/admin/admins/:id` — Remove platform admin
- `PATCH /api/admin/admins/:id/role` — Change admin role
- `GET /api/admin/security/audit` — Security audit log
- `GET /api/admin/security/failed-logins` — Failed login attempts
- `GET /api/admin/changelog` — Platform changelog
- `PUT /api/admin/changelog` — Update changelog
- `GET /api/admin/system-templates` — System templates
- `PUT /api/admin/system-templates` — Update system templates

### Health
- `GET /api/health` — Health check (DB + Redis latency)

## Architecture

```
+--------+     +----------+     +----------+
| Nginx  |---->| Frontend |     | Browser  |
| :80    |     | :3000    |<----|          |
+---+----+     +----------+     +----------+
    |
    v
+---+----+     +----------+     +----------+
| Backend|---->| PostgreSQL|    | Redis    |
| :4000  |     | :5432    |     | :6379    |
+---+----+     +----------+     +-----+----+
    |                               |
    +--- Email Worker (Bull queue)  |
    +--- Reply Tracker (IMAP)        |
    +--- Scheduler (cron)            |
    +--- Gmail OAuth Refresh (cron) |
```

### API Key Management

All API keys are stored encrypted (AES-256-GCM) in the `system_settings` table. The system checks DB first, then falls back to environment variables. Keys are cached in memory with a 5-minute TTL.

### Multi-Tenant Security

Every SaaS route filters by `organization_id` from the JWT. The `tenantScope` middleware injects `req.organizationId`. Org-level rate limiting (1000 req/min) prevents one tenant from overloading the API.

### Database Tables

| Table | Purpose |
|-------|---------|
| `users` | Users with role + organization |
| `organizations` | Multi-tenant orgs with plan, limits, owner |
| `roles` | 8+ roles with permissions array |
| `brands` | Brand configurations |
| `smtp_accounts` | SMTP credentials (encrypted) + health |
| `leads` | All leads from all sources |
| `campaigns` | Campaign definitions and status |
| `campaign_leads` | Campaign/lead assignments |
| `emails_sent` | Sent email records with tracking |
| `email_templates` | Reusable email templates |
| `email_signatures` | Email signatures per brand |
| `ab_tests` / `ab_test_variants` | A/B test configurations |
| `reply_messages` | Tracked email replies |
| `phone_calls` | Vapi call records |
| `vapi_knowledge_entries` | Knowledge base for AI calling agent |
| `webhook_sources` | Inbound webhook configurations |
| `outbound_integrations` | Outbound integrations |
| `google_sheet_connections` | Google Sheets import configs |
| `system_settings` | Key-value settings (encrypted API keys) |
| `audit_logs` | Full audit trail |
| `notifications` | In-app notifications |
| `stripe_events` | Stripe webhook idempotency |
| `organization_invitations` | Pending org invitations |
| `refresh_tokens` | JWT refresh token storage |
| `ai_agent_logs` | AI agent execution history |
| `ai_chat_messages` | AI chat conversation history |
| `warmup_campaigns` | Email warmup campaigns with daily ramp |
| `warmup_emails` | Individual warmup emails sent/received |
| `warmup_pools` | Warmup account pools |
| `warmup_pool_accounts` | Accounts in warmup pools |
| `warmup_daily_logs` | Daily warmup statistics |
| `hubspot_connections` | HubSpot OAuth2 connections |
| `hubspot_sync_logs` | HubSpot sync run history |
| `tracking_domains` | Custom tracking domains per brand |
| `scheduled_reports` | Automated report configurations |
| `report_delivery_logs` | Report delivery history |
| `ai_reply_drafts` | AI-generated reply drafts |
| `ai_reply_agent_settings` | AI reply agent configuration |
| `voice_trigger_rules` | Voice command trigger rules |
| `voice_trigger_executions` | Voice trigger execution history |
| `deliverability_scores` | Per-account deliverability scores |
| `_migrations` | Migration tracking |

## Development (without Docker)

### Backend

```bash
cd backend
npm install
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

### Testing

```bash
cd backend
npm test              # Run all tests
npm run test:watch    # Run tests in watch mode
```

## License

Proprietary. All rights reserved.

---

**Owner:** AtAflex Solutions (Afzal Pansuvi — apansuvi1@gmail.com)
