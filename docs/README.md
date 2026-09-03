# LocalPulse service guides

Info guides for each portal module: what it does, how the SPA talks to the Express/Lambda API, which endpoints and external APIs are required, and which plan feature unlocks it.

## Quick map

| Guide | Feature key | Portal route |
|-------|-------------|--------------|
| [Auth & accounts](./auth.md) | — | `/login`, `/account` |
| [Dashboard](./dashboard.md) | `reporting` (stats) | `/dashboard` |
| [Business profile](./business-profile.md) | `local_presence` | `/profile` |
| [Citations](./citations.md) | `local_presence` | `/citations` |
| [GBP posts](./gbp-posts.md) | `local_presence` | `/posts` |
| [Photos / media](./media.md) | `local_presence` | `/media` |
| [Reviews](./reviews.md) | `local_presence` | `/reviews` |
| [Q&A](./qa.md) | `local_presence` | `/qa` |
| [Local Search Grid](./local-search-grid.md) | `local_growth` | `/rank-tracker` |
| [AI Insights](./ai-insights.md) | `local_growth` + `reporting` | `/report` |
| [Bookings](./bookings.md) | `bookings` | `/booking`, `/book/*` |
| [Admin](./admin.md) | admin credentials | `/admin` |
| [Integrations & APIs](./integrations-and-apis.md) | — | env / OAuth / webhooks |
| [Plans & entitlements](./plans-entitlements.md) | — | gating |

## How the frontend talks to the backend

1. Client sets `VITE_API_BASE` (API Gateway URL or `http://localhost:5000`).
2. Helpers in `client/src/lib/utils.ts` (`apiGet` / `apiPost` / `apiPatch` / `apiPut` / `apiDelete`) call `${VITE_API_BASE}/api/...`.
3. Host JWT is sent as `Authorization: Bearer <token>` (`client/src/lib/auth.ts`).
4. Feature gates: UI uses `FeatureGate` + nav filtering; API uses `requireFeature` / `requireAllFeatures`.
5. Missing entitlement → API `403` with `{ error: "upgrade_required", feature }` → SPA redirects away (modules are hidden, not shown as upsell tiles).

## Stack reminder

- **Frontend:** React + Vite (`client/`) → Vercel / `app.zappsites.com`
- **Backend:** TypeScript Express (`backend/server.ts`) → Node 22 Lambda (`backend/lambda.ts`)
- **DB:** Shared ZappSites RDS (not Neon)
- **Infra:** CDK stack `LocalSeoApi-{dev|prod}`

See also repo root [README.md](../README.md) and [INTEGRATION.md](../INTEGRATION.md).
