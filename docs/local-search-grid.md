# Local Search Grid

## What it does

Runs **local keyword / competitor gap analysis** so hosts can see visibility gaps around their business (Local Search Grid / rank-style insights).

## Feature gate

**`local_growth`**

Plans: `local-growth`, `complete-growth-system`.

## Frontend

`client/src/pages/RankTracker.tsx` → `/rank-tracker`

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
