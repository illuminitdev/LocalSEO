# Plans & entitlements

## What it does

Maps ZappSites **plan IDs** to portal **feature keys**. The SPA hides nav items and routes; the API rejects unauthorized module calls with `upgrade_required`.

Catalog kept in sync:

- `backend/lib/planCatalog.ts`
- `client/src/lib/planCatalog.ts`

## Feature keys

| Key | Unlocks |
|-----|---------|
| `bookings` | Booking board, schedule, host + Google Calendar integration APIs |
| `local_presence` | Profile, citations, posts, media, reviews, Q&A, Places/business APIs |
| `local_growth` | Local Search Grid (`/rank-tracker`), gap analysis |
| `reporting` | Dashboard stats/activity APIs; with `local_growth` → AI Insights |

## Plans → features

| plan_id | Features |
|---------|----------|
| `website-essential` | *(none)* |
| `booking-solo` / `booking-solo-plus` / `booking-pro` | `bookings` |
| `local-presence` | `local_presence` |
| `local-growth` | `local_presence`, `local_growth`, `reporting` |
| `complete-growth-system` | all four |

## How entitlements load

1. After login, `EntitlementsContext` calls `GET /api/auth/entitlements`.
2. Backend joins active `subscriptions` to `plan_features` / `plans` for the user’s org or customer email.
3. `FeatureGate` and Layout nav filter on the returned feature list.
4. Server middleware `requireFeature` / `requireAllFeatures` (`backend/middleware/entitlements.ts`) enforces the same on `/api/*`.

## Route → feature map

| Route | Feature(s) |
|-------|------------|
| `/dashboard`, `/account` | none |
| `/profile`, `/citations`, `/posts`, `/media`, `/reviews`, `/qa` | `local_presence` |
| `/rank-tracker` | `local_growth` |
| `/report` | `local_growth` + `reporting` |
| `/booking`, `/booking/settings` | `bookings` |

Public `/book/*` and `/api/public/*` are not gated by plan.

## Dev helpers

- `ENTITLEMENTS_DISABLED=true` — bypass gates + simulate plan UI
- `PATCH /api/auth/dev/subscription` — switch simulated plan (non–shared-RDS / dev)
- Prefer real `portal_invites` on shared RDS for end-to-end tests

## Out of scope in LocalPulse

- Stripe/OTP checkout for **plans** (ZappSites Payment API)
- Creating `plans` / `plan_features` / `subscriptions` / `portal_invites` on shared RDS (ZappSites owns them)
