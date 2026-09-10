# Free Local Visibility Audit

## What it does

Runs a **GBP/Maps-first** free audit (score out of 100) from Local Search Grid: website reachability, Google listing, NAP compare, reviews signals, profile optimisation signals, and Top-10 `"{service} near {town}"` visibility. AI writes a plain-English report. No deep crawl / Lighthouse.

## Feature gate

**None in v1** — endpoint is auth-only. Plan/subscription gating is deferred.

## Frontend

- Entry: `client/src/pages/RankTracker.tsx` (`/rank-tracker`) — CTA + form + progress
- Report: `client/src/pages/VisibilityAuditReport.tsx` (`/visibility-audit/report`) — reads `sessionStorage`
- Map: `client/src/components/PlacesMap.tsx` with multi-markers when `VITE_GOOGLE_MAPS_JS_KEY` is set

## Backend

| Method | Endpoint | Gate | Purpose |
|--------|----------|------|---------|
| `POST` | `/api/visibility-audit` | auth only | Run pipeline; return full JSON (no DB) |

Engine: `backend/lib/visibilityAudit/`

## External APIs

| API | Env | Role |
|-----|-----|------|
| Google Places | `GOOGLE_PLACES_API_KEY` | GBP lookup + Top 10 text search |
| Maps JavaScript | `VITE_GOOGLE_MAPS_JS_KEY` | Report map UI |
| Gemini | `GEMINI_API_KEY` | AI report (fallback template if missing) |
## Deferred

- Entitlements / plan who-can-access
- `visibility_audits` table + shareable `GET :id`
