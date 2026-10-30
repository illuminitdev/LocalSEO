# AI Insights

## What it does

Overview page with prioritized tasks, an AI growth recommendation and a weekly Map Pack comparison against competitors. (LLM answer tracking lives on its own page: see [llm-visibility.md](llm-visibility.md).)

- **Prioritized Actions** — top 3 tasks worked out from stored data (no external calls): respond to low-rated reviews (≤3★ in the saved reviews) or reply rate under 80%, add business hours / update holiday hours (UK bank holiday within 30 days), upload photos (<20), publish a post (none this week), complete the profile (<90%). Each links to the page that fixes it.
- **Growth Strategy** — AI recommendation (Gemini, from real keyword volumes and Map Pack data; falls back to a rule-based line) with an "Apply Optimization" button (opens Posts), plus **Market Opportunities** (rising keyword searches from DataForSEO monthly trends; strongest Map Pack competitor and review gap).
- **Visibility Share vs. Competitors** — stacked bars for the last 4 weeks: share of Map Pack (top 3) slots held by You vs the two strongest competitors across 5 keywords (tracked keywords first, then category + town suggestions). One snapshot is saved each time "Generate strategy" / "Refresh" is clicked; the latest snapshot per week is shown, so the chart fills in as it is refreshed weekly.

Direction requests, calls and website clicks are not shown (no data source).

## Feature gate

Requires **both** `local_growth` **and** `reporting` (`requireAllFeatures`).

Plans: `local-growth`, `complete-growth-system`.

## Frontend

`client/src/features/report/ReportGenerator.tsx` → `/report` (sidebar: Track visibility → AI Insights)

1. Page load: `GET /api/ai/insights` (actions are computed live; strategy + chart history come from the last saved refresh).
2. "Run Map Pack check" / "Generate strategy" / "Refresh": runs the plan, pack, trends and finish requests below.

## Backend connection

| Method | Endpoint | Features | Purpose |
|--------|----------|----------|---------|
| `GET` | `/api/ai/insights` | `local_growth` + `reporting` | Live actions + latest strategy + snapshot history |
| `POST` | `/api/ai/insights/plan`, `/pack`, `/trends`, `/finish` | The check runs as short requests: plan the 5 keywords, one Maps top-3 lookup per keyword (in parallel, retried once), search-volume trends, then `finish` builds the snapshot + Gemini recommendation and saves it (`aiInsights`, `aiInsightsHistory`, last 30) |

All backend logic for AI Insights and LLM Visibility lives in `backend/lib/aiInsights.ts`; routes are in `backend/server.ts`.

## External APIs needed

| API | Env | Role |
|-----|-----|------|
| DataForSEO (Maps SERP, Google Ads search volume) | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Map Pack share, keyword volume/trend |
| Google Gemini | `GEMINI_API_KEY` | Growth recommendation |

Each refresh bills 5 Maps SERP calls + 1 search-volume call on DataForSEO, so it runs on demand only.

## Running the Map Pack check

Click **Run Map Pack check** (chart card) or **Generate strategy** (Growth Strategy card); both run the check described above. It takes up to ~30s. The page then shows:

- the 4-week chart (this week's bar appears immediately; earlier weeks fill in as the check is run in later weeks),
- a table of who holds the Map Pack top 3 for each of the 5 keywords (you highlighted),
- "What this means for you": plain-English problems (not in the top 3, review gap vs the strongest competitor).

If Google Maps returns nothing, or DataForSEO errors (login/balance/access), nothing is saved and the page shows the real error message instead of an empty chart.

## History

The Past Map Pack checks box shows the latest 5 runs. Each row has a delete (trash) icon: `DELETE /api/ai/insights/history?createdAt=...`.

## Credits and cooldown

A refresh costs **6 credits**, taken when the check starts (`/plan`) and refunded if `/finish` fails. The check can be run once a week: 7 days after the last successful refresh (`INSIGHTS_COOLDOWN_HOURS` in `planCatalog.ts`; the server answers 429 `cooldown` and the button shows "Next refresh Mon 26 Oct"). A failed refresh is refunded and does not lock the button.

Saved results survive other requests: `saveOrgToDb` writes only the dashboard keys a request changed (`dashboardPatch` / `saveOrgDashboardPatch` in `orgAppState.ts`), so a slower request that loaded older state (for example a retried `/pack`) cannot overwrite the `aiInsights` result that `/finish` saved. `/pack` and `/trends` only run inside the 15-minute window opened by `/plan`. Rank movers in the actions come from the `rank_checks` table. See [usage-credits.md](usage-credits.md).
