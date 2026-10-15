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

`/rank-tracker` scans a hidden **3x3 sample** (9 points) around the chosen location: Google Maps map, Competitor Map Share, AI Ranking Insights, Opportunity Finder and Keyword Optimization Health. A scan costs **9 credits** (see [usage-credits.md](usage-credits.md)).

Scans always run from one of the org's **saved locations** (up to 1 / 3 / 10 by plan; the business address is location 1, added automatically). Clients pick from a list and cannot type any address. Each location keeps its own scan history.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/rank/state?locationId=` | Saved locations, scanned keywords and latest scan per keyword for that location |
| `POST` | `/api/rank/scan-start` | Checks the 24h cooldown for keyword + location, takes the credits, returns a `scanId` |
| `POST` | `/api/rank/scan-row` | One grid point (DataForSEO `serp/google/maps/live/advanced`); needs `scanId` and `locationId` |
| `POST` | `/api/rank/scan-finish` | Saves the scan (avg rank, top-3 %, competitor share, health) and refunds failed points once |
| `POST` | `/api/ai/rank-insights` | Insights + opportunities (Gemini wording, computed facts), cached per location |
| `GET/POST/DELETE` | `/api/locations` | List, add (geocoded server-side, plan limit) and remove locations |

Scans are stored in the `grid_scans` table (migration 036): the full grid is kept 90 days, the summary numbers 12 months. The client scans point by point (5 in parallel) to stay inside API timeouts.
Env: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`. Without them, Run Scan falls back to the old estimated 3x3 grid (`/api/ai/gap-analysis`) with a notice and no credits are charged.
