# LocalPulse (Local SEO portal)

ZappSites Local SEO portal — TypeScript Express API + React SPA. Shares the **ZappSites AWS RDS** (plans, subscriptions, portal_invites). Neon is not used.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite (`client/`) — Vercel OK |
| Backend | TypeScript Express (`backend/`) → Node 22 Lambda |
| Infra | AWS CDK (`backend/infra/`) → `LocalSeoApi-{dev\|prod}` |
| DB | Shared ZappSites RDS via Secrets Manager + RDS Proxy |

## Local development

```bash
npm run install:all
cp backend/.env.example backend/.env
# For pure local Postgres: set DATABASE_URL and leave DB_PROXY_ENDPOINT empty
# For shared RDS from a bastion/VPN: set DB_* vars + SHARED_RDS=true

npm run migrate --prefix backend
npm run dev:backend   # http://localhost:5000
npm run dev:client    # http://localhost:5173
```

Set `VITE_API_BASE` in the client when the API is on another origin (after AWS deploy).

## Deploy API (CDK, uses your terminal AWS credentials)

Account `288761766237`, region `us-east-1` (same as ZappSites). Identity: `aws sts get-caller-identity`.

```powershell
cd backend\infra
npm install
cd ..
npm run deploy:dev
# or
npm run deploy:prod
```

Or from repo root:

```powershell
npm run deploy:api:dev
```

**Marketing:** [www.zappsites.com](https://www.zappsites.com/) · staging: `https://staging.zappsites.com`  
**Portal prod:** [app.zappsites.com](https://app.zappsites.com/)  
**Dev portal:** live URL TBD  

**Dev API:** `https://ud9zl0ww6d.execute-api.us-east-1.amazonaws.com`  
**Prod API:** `https://zw8pq7vyi2.execute-api.us-east-1.amazonaws.com`

Point the SPA at the matching API (`VITE_API_BASE`). Set Payment Lambda `LOCAL_SEO_APP_URL` to `https://app.zappsites.com` (prod).

Ensure ZappSites migrations **010 + 011** are applied first:

```powershell
Invoke-RestMethod -Method POST `
  -Uri "https://de8hudsztk.execute-api.us-east-1.amazonaws.com/ops/platform-migrate" `
  -Headers @{ "x-ops-secret" = "zappsites-ops-dev" }
```

On shared RDS, LocalPulse **skips** creating `plans` / `subscriptions` (005/006). It still migrates users/orgs/bookings + `must_change_password`.

## Auth & plans

1. Customer pays on ZappSites → Payment webhook writes `subscriptions` + `portal_invites` (SHA-256 temp password).
2. Login here: claim invite → create user (bcrypt) + org → link `subscriptions.org_id` → force password change.
3. Nav/modules only show feature keys from active subscription (`bookings`, `local_presence`, `local_growth`, `reporting`). Others are **hidden**.

### Manual invite test (dev RDS)

```sql
INSERT INTO subscriptions (plan_id, status, customer_email, customer_name, customer_phone)
VALUES ('local-presence', 'active', 'tester@example.com', 'Test User', '+447700900000');

-- password plaintext: Zs-TestPass1!
INSERT INTO portal_invites (
  email, full_name, phone, plan_id, password_hash, must_change_password, status, features
) VALUES (
  'tester@example.com', 'Test User', '+447700900000', 'local-presence',
  encode(digest('Zs-TestPass1!', 'sha256'), 'hex'),
  TRUE, 'paid', '["local_presence"]'::jsonb
);
```

Login with `tester@example.com` / `Zs-TestPass1!` → only local presence modules. Repeat with `complete-growth-system` for all four features. Change password in Account Settings.

## Admin

`/admin` — set `ADMIN_PASSWORD` in `backend/.env` (required for deploy).
- **Prod / main** (`app.zappsites.com`): `admin@localseo.com`
- **Dev / testing**: `admin@localseo.net`
Emails are stage-locked in code (not taken from `.env`).

### Full Audit (admin only)

Sidebar **Full Audit** — deep / fullcrawl history from the **shared ZappSites RDS** `audits` / `audit_jobs` tables (`kind=deep`). Do not create a second audit database.

**Report quality APIs (admin Full Audit worker — not client Visibility / Growth Audit):**

| Job | API |
|-----|-----|
| Local pack for deep report | **DataForSEO** Maps live (`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`; Secrets `Zappsites/prod/DATAFORSEO_*`) |
| GBP / Places on worker | `GOOGLE_PLACES_API_KEY` (demo key OK for now) |
| AI deep report | Paid Gemini via `Zappsites/prod/GEMINI_API_KEY` on the audit worker |

Redeploy worker after changing those secrets: `npm run deploy:worker:prod` (Docker required).

Phase 1 BFF proxies to the existing ZappSites ops API (server-side `AUDIT_OPS_SECRET`; never in the browser):

| Env | Purpose |
|-----|---------|
| `ZAPP_SITES_API_BASE` | ZappSites API (prod: `https://dvj0p5k5d0.execute-api.us-east-1.amazonaws.com`) |
| `AUDIT_OPS_SECRET` | From Secrets Manager `Zappsites/{stage}/AUDIT_OPS_SECRET` |
| `ZAPP_SITES_ORIGIN` | Share links (`https://www.zappsites.com`) |

Admin actions: **New full audit** (poll job ~4s), **Copy shareable link** (`/audit-report/{id}`), **Download PDF** (print-quality A4 via ZappSites PDF pipeline).

Public Growth Audit + marketing `/audit-report/:id` stay on ZappSites. Do not ask ZappSites to remove `/fullcrawl` until Local SEO Phase 1 **and** worker deploy from this repo are verified.

### Full Audit worker deploy (Phase 2)

Worker package: [`backend/audit-worker/`](backend/audit-worker/) — Docker Lambda that consumes `zappsites-{stage}-audit-jobs` and writes the shared RDS `audits` / `audit_jobs` tables (never create/drop/truncate those).

**Docker Desktop must be running** for worker deploy (`docker ps`). Not required for API-only deploys. First image build can take 20–45 minutes on Windows.

```powershell
# Prereqs
aws sts get-caller-identity
docker ps

# API BFF only (no Docker)
cd c:\Users\svpku\LocalPulse
npm run deploy:api:prod
# optional: npm run deploy:api:dev

# Audit worker — updates existing ZappsitesAuditWorker-prod (reuses queue)
cd c:\Users\svpku\LocalPulse\backend
npm run deploy:worker:prod
# optional: npm run deploy:worker:dev
```

Stacks / names (prod): CloudFormation `ZappsitesAuditWorker-prod`, Lambda `zappsites-prod-audit-worker`, SQS `zappsites-prod-audit-jobs` (imported, not recreated). With `reuseAuditQueue=true` (default), the SQS→Lambda event source stays the existing **Enabled** mapping (not recreated in CFN — avoids duplicate consumers / stale UUID updates). After a successful worker deploy + one fullcrawl from Admin Full Audit, notify ZappSites to remove `/fullcrawl` and stop deploying the audit worker from the zappsites repo.

## Neon

Removed. Do not add Neon URLs for AWS paths. Use ZappSites RDS Proxy + Secrets Manager.
