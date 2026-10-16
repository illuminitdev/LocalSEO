# Visibility Tracker

## What it does

Tracks the Google Maps rank of up to **10 keywords** at a saved location (the business address by default). Shows current rank, change over 7 / 14 / 30 / 90 days, search volume, a trend line and the top competitors. Keyword ideas come from the business category, services and city.

## Feature gate

**`local_growth`** (plans `local-growth`, `complete-growth-system`).

## Frontend

`client/src/features/visibility/VisibilityTracker.tsx` → `/visibility-tracker`. A location picker (shared `LocationPicker`) switches the location; the keyword list is shared, rank history is per location.

## Backend

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/visibility-tracker?locationId=` | Keywords with rank history at that location, plus locations and limits |
| `GET` | `/api/visibility-tracker/suggestions` | Starting ideas (cached 7 days). With `?q=` a new search costs 1 credit and is cached per query |
| `POST` | `/api/visibility-tracker/keywords` | Add keywords (max 10; accounts above 10 keep theirs but cannot add) |
| `POST` | `/api/visibility-tracker/remove` | Remove a keyword |
| `POST` | `/api/visibility-tracker/check` | Check up to 5 keywords: 1 credit each, skips keywords checked in the last 24h, refunds failures |

Keyword list and volumes stay in the org dashboard JSON; every check is a row in the `rank_checks` table (migration 036), kept 12 months. Old history in the JSON is imported once into the business-address location.

## Automatic checks

**Turned off on every plan** (`AUTO_CHECK_EVERY_DAYS` in `backend/lib/planCatalog.ts` is empty). Keywords are only checked when the user clicks Check.

`backend/jobs.ts` still runs daily (EventBridge, 03:30 UTC, separate `localseo-jobs-{stage}` Lambda) and deletes history older than 12 months. To turn automatic checks back on, add a plan to `AUTO_CHECK_EVERY_DAYS` (for example `'local-growth': 7`) and to `AUTO_CHECKS` in `client/src/features/account/UsagePanel.tsx`; the job then checks tracked keywords at the business address when due, paying from the same monthly credits and skipping when the pool is short.

Credits and cooldown rules: [usage-credits.md](usage-credits.md).

## External APIs

DataForSEO (Maps SERP, Google Ads search volume): `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`.
