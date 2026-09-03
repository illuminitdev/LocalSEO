# Admin

## What it does

Internal ops console to view portal usage, list orgs/users, assign plan subscriptions for testing/ops, and inspect which plans unlock which services.

Not customer-facing. Separate login from host JWT.

## Feature gate

Admin credentials (`ADMIN_EMAIL` / `ADMIN_PASSWORD`), not plan features.

## Frontend

| Page | Path |
|------|------|
| Admin login | `client/src/pages/admin/AdminLogin.tsx` → `/admin/login` |
| Overview | `AdminDashboard.tsx` → `/admin` |
| Users / orgs | `AdminUsers.tsx` → `/admin/users` |
| Services map | `AdminServices.tsx` → `/admin/services` |

API client: `client/src/lib/adminApi.ts` + `adminAuth.ts`  
Guard: `client/src/components/RequireAdmin.tsx`  
Layout: `client/src/components/AdminLayout.tsx`

## Backend connection

Mounted at `/api/admin` → `backend/routes/admin.ts`  
Middleware: `backend/middleware/adminAuth.ts`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/admin/login` | Issue admin token |
| `GET` | `/api/admin/me` | Current admin session |
| `GET` | `/api/admin/overview` | High-level counts |
| `GET` | `/api/admin/users` | Orgs / users / subscriptions |
| `PATCH` | `/api/admin/organizations/:orgId/subscription` | Assign / clear plan |
| `GET` | `/api/admin/plans` | Plan catalog |
| `GET` | `/api/admin/services` | Feature → plans matrix |

Prefer ZappSites Payment webhook for real customers; admin subscription writes are for ops/dev.

## External APIs needed

| Dependency | Env |
|------------|-----|
| Postgres | Shared RDS vars |
| Admin login | `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| JWT | `JWT_SECRET` (or admin token secret as implemented) |

No Gemini / Places / Stripe required for admin console itself.
