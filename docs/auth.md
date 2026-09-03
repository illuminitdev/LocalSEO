# Auth & accounts

## What it does

Lets customers sign in to the Local SEO portal after paying on ZappSites. First login can **claim a portal invite** (temp password), create the user + org, and force a password change. Also covers profile name updates, password change, and forgot/reset password.

Self-serve public registration is disabled (`/register` redirects to login). Accounts come from paid invites / admin ops.

## Feature gate

None for login/account. Entitlements load after auth.

## Frontend

| Page | Path |
|------|------|
| Login | `client/src/pages/Login.tsx` → `/login` |
| Forgot password | `client/src/pages/ForgotPassword.tsx` |
| Reset password | `client/src/pages/ResetPassword.tsx` |
| Account settings | `client/src/pages/Account.tsx` → `/account` |

Auth helpers: `client/src/lib/auth.ts`  
Entitlements context: `client/src/context/EntitlementsContext.tsx`  
Route guard: `client/src/components/RequireAuth.tsx`

## Backend connection

Mounted at `/api/auth` → `backend/routes/auth.ts`

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `POST` | `/api/auth/login` | no | Email/password; may claim `portal_invites` |
| `POST` | `/api/auth/register` | no | Legacy / disabled in product flow |
| `POST` | `/api/auth/forgot-password` | no | Issues reset token |
| `POST` | `/api/auth/reset-password` | no | Applies token + new password |
| `GET` | `/api/auth/me` | JWT | Current user |
| `GET` | `/api/auth/entitlements` | JWT | Active plan feature keys |
| `PATCH` | `/api/auth/profile` | JWT | Update display name |
| `PATCH` | `/api/auth/password` | JWT | Change password (clears `must_change_password`) |
| `PATCH` | `/api/auth/dev/subscription` | JWT | Dev-only plan simulation |

Middleware: `backend/middleware/auth.ts` (JWT via `JWT_SECRET`).

## Invite claim flow

1. Customer pays on ZappSites → Payment webhook writes `subscriptions` + `portal_invites` (SHA-256 temp password).
2. Login with invite email + temp password.
3. Backend creates `users` (bcrypt), org, membership; links `subscriptions.org_id`; marks invite claimed.
4. SPA forces password change when `must_change_password` is true.

## External APIs needed

| Dependency | Env | Notes |
|------------|-----|-------|
| Postgres (shared RDS) | `DATABASE_URL` or `DB_SECRET_ARN` + `DB_PROXY_ENDPOINT` | Users, invites, subscriptions |
| JWT signing | `JWT_SECRET` | Required |

No third-party identity provider for host login.

## Related DB

- `users`, orgs/memberships (LocalPulse migrations)
- `portal_invites`, `subscriptions`, `plans` / `plan_features` (owned by ZappSites on shared RDS)
- `password_reset` tokens (`004_password_reset.sql`)
- `must_change_password` (`007_must_change_password.sql`)
