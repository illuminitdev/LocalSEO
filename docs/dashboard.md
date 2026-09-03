# Dashboard

## What it does

Home overview after login: connected business snapshot, activity feed, and (when entitled) reporting stats such as completeness score, visibility metrics, and recent portal actions.

## Feature gate

- Page itself: always reachable for authenticated users.
- Stats / activity APIs: require feature key **`reporting`**.
- Business snapshot: uses `/api/business` → **`local_presence`** (fails quietly if not entitled).

## Frontend

`client/src/pages/Dashboard.tsx` → `/dashboard`

Calls:

- `GET /api/business` (optional; ignored on failure)
- `GET /api/dashboard/stats` (when reporting is available)

Other modules write activity via `POST /api/dashboard/activity` so the feed stays current.

## Backend connection

Defined in `backend/server.ts`

| Method | Endpoint | Feature | Purpose |
|--------|----------|---------|---------|
| `GET` | `/api/dashboard/stats` | `reporting` | Scores + activity list |
| `POST` | `/api/dashboard/activity` | `reporting` | Append activity item |
| `POST` | `/api/dashboard/update-stats` | `reporting` | Patch metric fields |
| `GET` | `/api/business` | `local_presence` | Connected GBP-style profile |
| `GET` | `/api/status` | none | Gemini / Places readiness |

Dashboard state is in-memory app state (persisted via store), not a dedicated reporting warehouse.

## External APIs needed

None directly. Metrics are updated by other services (Places connect, AI tools). Gemini / Places are used by those modules, not by the dashboard page itself.

## Env

Standard auth + DB only for this page.
