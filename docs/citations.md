# Citations

## What it does

Generates an AI-assisted **citation / directory checklist** for the connected business (where NAP should be consistent across the web). Logs the action to the dashboard activity feed when reporting is available.

## Feature gate

**`local_presence`**

## Frontend

`client/src/pages/Citations.tsx` → `/citations`

- `POST /api/ai/citations` with `{}` (uses connected business context on the server)
- `POST /api/dashboard/activity` after success

## Backend connection

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `POST` | `/api/ai/citations` | `local_presence` | Generate citation guidance |
| `GET` | `/api/business` | `local_presence` | Implicit dependency (business should be connected) |

## External APIs needed

| API | Env |
|-----|-----|
| Google Gemini | `GEMINI_API_KEY` |

Places is not called on this page, but a connected business (from Places/Gemini search) improves output quality.
