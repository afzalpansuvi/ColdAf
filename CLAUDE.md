# ColdAF Email Tool — Project Reference

## Architecture

- **Backend**: Node.js 20 + Express 4 + PostgreSQL 16 + Redis 7 + Bull queues
- **Frontend**: React 18 + Vite 5 + Tailwind CSS 3 + Recharts + Lucide React
- **Auth**: JWT in httpOnly cookies + refresh tokens + role-based access (8 roles)
- **Email**: 4 providers (SMTP, SendGrid, Mailgun, Gmail OAuth) with queue dispatch
- **AI**: Multi-provider (Claude, GPT, Gemini) with per-organization API key storage
- **Calling**: Vapi.ai integration for outbound AI voice calls
- **Billing**: Stripe subscription billing with 4 plan tiers
- **Deployment**: Docker Compose (dev + prod) with Nginx reverse proxy + Traefik SSL

## Directory Structure

```
backend/
  src/
    config/          database.js, env.js, redis.js
    db/migrations/   001-011 schema migrations
    middleware/      auth.js, rateLimiter.js, rbac.js, tenantScope.js
    routes/          28 route files (auth, users, brands, campaigns, etc.)
    services/        business logic (email, AI, tracking, billing, etc.)
    services/agents/ multi-agent AI system (CEO, cold email, cold calling)
    workers/         schedulerWorker.js, emailWorker.js, sequenceProcessor.js
    utils/           encryption.js, logger.js, validators.js
    index.js         Express app entry point
  seeds/             admin.js, platformOwner.js
frontend/
  src/
    api/client.js    fetch-based API client (no mock data)
    contexts/        AuthContext.jsx, BrandingContext.jsx
    components/      Layout, ErrorBoundary, AdminLayout, etc.
    pages/           30+ page components
    pages/admin/     15-section platform admin panel
    App.jsx          React Router configuration
nginx/             nginx.conf, Dockerfile
docker-compose.yml, docker-compose.prod.yml
```

## Multi-Tenant Rules (CRITICAL)

Every database query in routes MUST filter by `organization_id` from the JWT payload. The `tenantScope.js` middleware injects `req.organizationId`. All routes must use it.

Tables that require `organization_id`:
- brands, smtp_accounts, leads, campaigns, campaign_leads, emails_sent
- email_templates, email_signatures, reply_messages, phone_calls
- google_sheet_connections, webhook_sources, outbound_integrations
- ai_chat_messages, ai_agent_logs, vapi_knowledge_entries, notifications
- audit_logs (nullable for platform-level records)

## Environment Variables

Critical secrets (production only):
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `DB_PASSWORD`
- `ANTHROPIC_API_KEY` (or set via Dashboard > Integrations > API Keys)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

See `.env.example` and `.env.production` for full list.

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env with real values

# Development
docker-compose up --build -d
docker-compose exec backend node src/db/migrate.js
docker-compose exec backend node seeds/admin.js

# Production (Hostinger VPS with Traefik)
./deploy.sh
```

## Database Migrations

Migration runner: `backend/src/db/migrate.js`
- Tracks executed migrations in `_migrations` table
- No locking — run in single container only during deploy
- 11 migrations total covering initial schema through admin panel tables

## API Key Management

3-tier resolution (DB-first + env fallback + cache):
1. Check `system_settings` table for encrypted key
2. Fall back to environment variable
3. Cache in memory with 5-minute TTL

## Testing

Test suite: `npm test` in backend/ (Jest + Supertest)
Minimum tests: auth flow, one CRUD route (brands)

## Known Issues (Current Sprint)

- Phase 1: Mock data removed, DEV auth bypass removed
- Phase 2: Adding organization_id filtering to all routes
- Phase 3: Implementing missing admin panel backend routes
- Phase 4: Production hardening (OAuth refresh, health checks, tests)

## Security Checklist

- [x] JWT in httpOnly cookies
- [x] AES-256-GCM for API keys and SMTP passwords
- [x] Rate limiting on login and API
- [x] SQL injection prevention (parameterized queries)
- [x] XSS prevention (helmet, CSP headers)
- [ ] Organization isolation (in progress)
- [ ] Input validation on all routes (in progress)

## Contact

Owner: AtAflex Solutions (Afzal Pansuvi — apansuvi1@gmail.com)
