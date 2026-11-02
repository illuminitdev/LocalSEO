# Citations

## What it does

Generates a **citation / directory checklist** for the connected business from BrightLocal listing lookups (DataForSEO is the fallback) (where NAP should be consistent across the web). Logs the action to the dashboard activity feed when reporting is available.

## Feature gate

**`local_presence`**

## Frontend

`client/src/features/local-presence/Citations.tsx` → `/citations`

- `GET /api/ai/citations` loads the saved scan
- `POST /api/ai/citations` with `{}` runs a directory scan for the connected business (the page polls until it finishes, up to about 3 minutes)
- `POST /api/dashboard/activity` after success

## Backend connection

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `GET` | `/api/ai/citations` | `local_presence` | Latest saved scan and history |
| `POST` | `/api/ai/citations` | `local_presence` | BrightLocal directory scan (DataForSEO fallback) |
| `GET` | `/api/business` | `local_presence` | Connected business used as the NAP to match |

## External APIs needed

| API | Env | Role |
|-----|-----|------|
| BrightLocal Local Data API | `BRIGHTLOCAL_API_KEY` | Main source. Looks the business up on 29 UK directories and returns each listing's name, address, phone, claimed status and rating |
| DataForSEO | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Live Google Maps, Google organic, Bing organic, and directory-index search |

When `BRIGHTLOCAL_API_KEY` is set, `POST /api/ai/citations` sends one `POST /data/v1/listings/find` request per directory (header `x-api-key`) with the business name, city, postcode and phone, then polls `GET /data/v1/listings/results/{request_id}` until each is `ready`. Finished directories are kept between polls. Any directory still running after 170 seconds is marked missing. The directory list is in `backend/lib/brightLocalCitations.ts`.

Without a BrightLocal key, the DataForSEO scan below is used.

The scan does not use Gemini. `POST /api/ai/citations` queues DataForSEO tasks and the page polls until they finish. It looks up the connected business on Google Maps, then matches real result URLs to a fixed directory list (Google, Bing Places, Apple Maps, Facebook, Yelp, Yell, and other UK directories). Name, phone, and address are taken from those results and compared with the saved profile. A directory with no matching page is marked missing.

Deployed API reads the same secrets as the audit worker: `Zappsites/prod/DATAFORSEO_LOGIN` and `Zappsites/prod/DATAFORSEO_PASSWORD`. Locally, set both values in `backend/.env`. For BrightLocal, set `BRIGHTLOCAL_API_KEY` in `backend/.env`. The deployed stack does not pass this key yet, so production still uses DataForSEO until it is added.

Places is not called on this page, but a connected business (name, address, phone, and map coordinates) makes the match accurate.

## Credits

A new scan costs **4 credits**, charged once when the scan starts (the polling requests are free) and refunded if the scan fails. See [usage-credits.md](usage-credits.md).
