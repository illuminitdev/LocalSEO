# AI Insights (strategy report)

## What it does

Builds a **strategy / insights report** from dashboard stats and portal activity — summary of local SEO posture and recommended next actions.

## Feature gate

Requires **both** `local_growth` **and** `reporting` (`requireAllFeatures`).

Plans: `local-growth`, `complete-growth-system`.

## Frontend

`client/src/pages/ReportGenerator.tsx` → `/report`

1. `GET /api/dashboard/stats`
2. `POST /api/ai/strategy-report` with stats payload
3. `POST /api/dashboard/activity` after generation

Wrapped in `<FeatureGate features={['local_growth', 'reporting']}>`.

## Backend connection

| Method | Endpoint | Features | Purpose |
|--------|----------|----------|---------|
| `GET` | `/api/dashboard/stats` | `reporting` | Input metrics |
| `POST` | `/api/ai/strategy-report` | `local_growth` + `reporting` | AI report |

## External APIs needed

| API | Env |
|-----|-----|
| Google Gemini | `GEMINI_API_KEY` |

Indirect dependency: other modules should have populated stats/activity for a useful report.
