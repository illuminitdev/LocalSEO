# Reviews

## What it does

Shows reviews from the **connected business** snapshot and drafts AI **reply suggestions** for each review. Can log response activity to the dashboard.

## Feature gate

**`local_presence`**

## Frontend

`client/src/pages/ReviewManagement.tsx` → `/reviews`

| Action | API |
|--------|-----|
| Load reviews | `GET /api/business` (uses `business.reviews`) |
| Draft reply | `POST /api/ai/review-reply` `{ review, businessName, ... }` |
| Log activity | `POST /api/dashboard/activity` |

## Backend connection

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `GET` | `/api/business` | `local_presence` | Reviews embedded on connect |
| `POST` | `/api/ai/review-reply` | `local_presence` | AI reply draft |

Reviews are pulled when connecting via Places (or Gemini fallback), not via live Google My Business sync.

## External APIs needed

| API | Env | Role |
|-----|-----|------|
| Google Places | `GOOGLE_PLACES_API_KEY` | Source of review snippets on connect |
| Google Gemini | `GEMINI_API_KEY` | Reply generation |

No Google Business Profile API write-back for posting replies automatically.
