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

`/admin` — set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`.

## Neon

Removed. Do not add Neon URLs for AWS paths. Use ZappSites RDS Proxy + Secrets Manager.
