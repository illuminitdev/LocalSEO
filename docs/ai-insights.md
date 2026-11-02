# AI Insights

## What it does

A report page: one click checks who holds the Google Maps top 3 for 5 keywords, then **one Gemini call writes the report** from that real data. **Export** (top right, next to History and Refresh) downloads the report (`#insights-content`; buttons and links marked `.pdf-hide` are left out). (LLM answer tracking lives on its own page: see [llm-visibility.md](llm-visibility.md).)

Report sections, in order (situation → evidence → plan):

1. **Header**: business name, category, address, report date, keywords checked.
2. **Summary**: AI summary (falls back to the rule-based problems), a pointer to the Action plan, and tiles: top-3 spots held, Map Pack share, top competitor reviews, tracked keywords up/down, each with the change since the previous check.
3. **Map Pack share by week** (graph): stacked bars for the last 4 weeks: You, the two strongest competitors, Others.
4. **Keyword rank movement** (graph): previous vs latest Google Maps rank for each Visibility Tracker keyword (`trackerRows`). Hidden when nothing is tracked.
5. **Who holds the top 3**: keyword × #1/#2/#3 table.
6. **Competitor analysis**: up to 3 competitors with category, rating, reviews and spots, plus the AI's "why they are ahead". AI names not in the data are dropped.
7. **What your customers say**: AI praise / complaints / words customers use, from the recent Google reviews.
8. **Keyword opportunities**: search volume and change **vs the same month last year** (so seasonality is not read as growth), with the AI's reason for keywords it picks. AI keywords not in the data are dropped.
9. **Action plan** (last, after the evidence): this week's recommendation and plan steps, then the 3–5 AI **priority actions** (`report.actions`: title, why, area, priority; each links to the page that fixes it via `AREA_LINKS`), then the rule-based **Profile checklist** (`buildActions`, Done / Dismiss). Without an AI report the checklist is the action list.

Every section and summary tile has an (i) explainer (`client/src/shared/InfoTip.tsx`, texts in `INFO`).

Accuracy rules:

- **Share** is your part of **all** top-3 spots checked (`summarizeMarket`), not you vs the top 2 only. Snapshots saved before this change used the old method.
- **You** are matched by Google place ID (`place_id` from the Maps results vs `connectedBusiness.placeId`); the name is used only when an ID is missing, and a partial name match needs 8+ characters.
- **Low-rated review** action counts only reviews without an owner reply (synced `ownerReply` or a reply saved in the app, `reviewReplies`).
- **Review gap** compares with the **average** Map Pack competitor, at a steady pace (gap ÷ 26 weeks; above 10 a week it advises 5–10 a week, since sudden spikes can be filtered).

If Gemini fails or times out (20 s), the report still saves with the rule-based summary, checklist and recommendation (`recommendationSource: 'rule'`, `report: null`).

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
| `POST` | `/api/ai/insights/plan`, `/pack`, `/trends`, `/finish` | The check runs as short requests: plan the 5 keywords, one Maps top-3 lookup per keyword (in parallel, retried once), search-volume trends, then `finish` builds the snapshot, asks Gemini for the report (`reportPrompt` → `normalizeReport`) and saves it (`aiInsights`, `aiInsightsHistory`, last 30) |

All backend logic for AI Insights and LLM Visibility lives in `backend/lib/aiInsights.ts`; routes are in `backend/server.ts`.

## External APIs needed

| API | Env | Role |
|-----|-----|------|
| DataForSEO (Maps SERP, Google Ads search volume) | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Map Pack share, keyword volume/trend |
| Google Gemini | `GEMINI_API_KEY` | The written report (summary, actions, competitors, reviews, keywords, plan) |

Each refresh bills 5 Maps SERP calls + 1 search-volume call on DataForSEO, so it runs on demand only.

## Running the report

Click **Generate report** / **Refresh report** (top right). The check takes up to ~30s (progress shows on the button) and the report appears. Before the first run the page shows a short "how it works" card instead of the report; Export is disabled until there is a report.

If Google Maps returns nothing or DataForSEO fails, nothing is saved, credits are refunded and the page shows a clean "No findings this time" message (no technical error text).

## History

A **History (n)** button at the top right opens a popup with every saved check (date, spots held, share, change vs the check before). Clicking a row opens that check on the page and closes the popup; while an older check is open, a banner shows its date with a "Back to latest" button. Each row has a delete (trash) icon: `DELETE /api/ai/insights/history?createdAt=...`. The same popup (`client/src/shared/HistoryPanel.tsx`) is used on LLM Visibility and Citations (`DELETE /api/ai/citations/history?scannedAt=...`).

## Credits and cooldown

A refresh costs **6 credits**, taken when the check starts (`/plan`) and refunded if `/finish` fails. The check can be run once a week: 7 days after the last successful refresh (`INSIGHTS_COOLDOWN_HOURS` in `planCatalog.ts`; the server answers 429 `cooldown` and the button shows "Next refresh Mon 26 Oct"). A failed refresh is refunded and does not lock the button.

Saved results survive other requests: `saveOrgToDb` writes only the dashboard keys a request changed (`dashboardPatch` / `saveOrgDashboardPatch` in `orgAppState.ts`), so a slower request that loaded older state (for example a retried `/pack`) cannot overwrite the `aiInsights` result that `/finish` saved. `/pack` and `/trends` only run inside the 15-minute window opened by `/plan`. Rank movers in the actions come from the `rank_checks` table. See [usage-credits.md](usage-credits.md).
