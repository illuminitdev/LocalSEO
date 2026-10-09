# Citations

## What it does

Generates a **citation / directory checklist** for the connected business from live DataForSEO results (where NAP should be consistent across the web). Logs the action to the dashboard activity feed when reporting is available.

## Feature gate

**`local_presence`**

## Frontend

`client/src/features/local-presence/Citations.tsx` → `/citations`

- `GET /api/ai/citations` loads the saved scan
- `POST /api/ai/citations` with `{}` runs a DataForSEO scan for the connected business
- `POST /api/dashboard/activity` after success

## Backend connection

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `GET` | `/api/ai/citations` | `local_presence` | Latest saved scan and history |
| `POST` | `/api/ai/citations` | `local_presence` | DataForSEO directory scan |
| `GET` | `/api/business` | `local_presence` | Connected business used as the NAP to match |

## External APIs needed

| API | Env | Role |
|-----|-----|------|
| DataForSEO | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Live Google Maps, Google organic, Bing organic, and directory-index search |

The scan does not use Gemini. `POST /api/ai/citations` queues DataForSEO tasks and the page polls until they finish. It looks up the connected business on Google Maps, then matches real result URLs to a fixed directory list (Google, Bing Places, Apple Maps, Facebook, Yelp, Yell, and other UK directories). Name, phone, and address are taken from those results and compared with the saved profile. A directory with no matching page is marked missing.

Deployed API reads the same secrets as the audit worker: `Zappsites/prod/DATAFORSEO_LOGIN` and `Zappsites/prod/DATAFORSEO_PASSWORD`. Locally, set both values in `backend/.env`.

Places is not called on this page, but a connected business (name, address, phone, and map coordinates) makes the match accurate.
