# Local Search Grid

## What it does

Runs **local keyword / competitor gap analysis** so hosts can see visibility gaps around their business (Local Search Grid / rank-style insights).

## Feature gate

**`local_growth`**

Plans: `local-growth`, `complete-growth-system`.

## Frontend

`client/src/features/visibility/RankTracker.tsx` → `/rank-tracker`

- `POST /api/ai/gap-analysis` `{ keyword }`
- `POST /api/dashboard/activity` on success

Uses connected business location context on the server when available (Places lat/lng for nearby competitor logic).

## Backend connection

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `POST` | `/api/ai/gap-analysis` | `local_growth` | Keyword gap / competitor analysis |

Implementation in `backend/server.ts`; may use `nearbyCompetitors` from `backend/lib/googlePlaces.ts` when Places is configured.

## External APIs needed

| API | Env | Role |
|-----|-----|------|
| Google Gemini | `GEMINI_API_KEY` | Analysis narrative / structured gaps |
| Google Places | `GOOGLE_PLACES_API_KEY` | Nearby competitors when available |

Best results with both keys + a connected business profile.

## Local Rank Tracker (real grid scans)

`/rank-tracker` now shows a keyword + grid-size (5x5 / 7x7 / 9x9) scan over the Google map, Competitor Map Share, AI Ranking Insights, Opportunity Finder and Keyword Optimization Health.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/rank/state` | Tracked keywords + saved scans |
| `POST` | `/api/rank/scan-row` | Real Google Maps ranks for one grid row (DataForSEO `serp/google/maps/live/advanced`) |
| `POST` | `/api/rank/scan-finish` | Save the assembled grid; computes avg rank, top-3 %, competitor share, health, change |
| `POST` | `/api/ai/rank-insights` | Insights + opportunities (Gemini wording, computed facts) |

The client scans row by row (2 rows in parallel) to stay inside API timeouts. Cost per scan: 25 / 49 / 81 DataForSEO live calls.
Env: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`. Without them, Run Scan falls back to the old estimated 3x3 grid (`/api/ai/gap-analysis`) with a notice.
