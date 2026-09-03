# Business profile

## What it does

Connects a Google Business Profile (or listing) to the portal, stores NAP / hours / reviews snapshot, and runs an AI **profile audit** with a completeness score.

## Feature gate

**`local_presence`**

Plans: `local-presence`, `local-growth`, `complete-growth-system`.

## Frontend

| UI | Path |
|----|------|
| Profile audit page | `client/src/pages/ProfileAudit.tsx` → `/profile` |
| Places search modal/panel | `client/src/components/GroundingModal.tsx`, `GroundingPanel.tsx` |

Flow:

1. Search listing → `POST /api/places/search`
2. Connect → `POST /api/business/connect`
3. Audit → `POST /api/ai/audit`
4. Optionally update dashboard stats/activity

## Backend connection

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `GET` | `/api/business` | `local_presence` | Current connected business |
| `POST` | `/api/business/connect` | `local_presence` | Save connected profile |
| `POST` | `/api/places/search` | `local_presence` | Find listing by query |
| `POST` | `/api/ai/audit` | `local_presence` | AI completeness audit |

Implementation: `backend/server.ts` + `backend/lib/googlePlaces.ts`.

## External APIs needed

| API | Env | Role |
|-----|-----|------|
| **Google Places API** (New preferred) | `GOOGLE_PLACES_API_KEY` (or `GOOGLE_MAPS_API_KEY`) | Real listing search + details |
| **Google Gemini** | `GEMINI_API_KEY` | Audit text; fallback search if Places fails / missing |

Enable **Places API** on the Google Cloud project for the key. Without Places, search falls back to Gemini with Google Search grounding when Gemini is configured.

## How it connects

```
SPA /profile
  → VITE_API_BASE
  → Express/Lambda /api/places|/api/business|/api/ai/audit
  → Google Places and/or Gemini
  → in-memory connectedBusiness (+ app state persist)
```
