# LLM Visibility Tracking

## What it does

Measures how visible the business is inside generative AI / LLM answers. It asks ChatGPT, Claude, Perplexity and Google (AI Overviews) five customer-style questions about the business category and town (e.g. "Who is the best plumber in Leeds?"), then scores:

- **AI Share of Voice** — the business's share of all business mentions across the answers (change vs the previous check shown as a badge).
- **Brand Sentiment** — how favourably answers describe the business (only when it is mentioned).
- **LLM Optimization grade** — A+ to E, from ChatGPT mention rate, Google AI Overview inclusion, sentiment, share of voice and profile completeness.
- **Platform Breakdown**
  - *ChatGPT, Claude, Perplexity* (one card each, with the brand logo) — mention rate, average position among recommended businesses, common response contexts, most-mentioned competitors.
  - *Google AI Overviews* — inclusion %, how often an overview appears, sources cited, and AI-written optimization opportunities.
- A list of the questions asked and whether the business was mentioned, plus a history of past checks and a PDF export.

All numbers come from real answers. Nothing is invented; if no answer names the business, the page says so.

## Feature gate

Requires **both** `local_growth` **and** `reporting` (`requireAllFeatures`).

Plans: `local-growth`, `complete-growth-system`.

## Frontend

`client/src/features/llm-visibility/LlmVisibility.tsx` → `/llm-visibility` (sidebar: Track visibility → LLM Visibility)

"Run LLM Visibility Check" runs three short requests (each under the ~30s gateway limit):

1. In parallel: `POST /api/llm/visibility/chatgpt|claude|perplexity|google` return the raw answers. A platform that fails (e.g. model not available on the DataForSEO account) is shown as "could not be checked" with the reason; the others still score.
2. `POST /api/llm/visibility/analyze` with those answers → scored report, saved to history.
3. `POST /api/dashboard/activity` logs the run.

Page load calls `GET /api/llm/visibility` for the latest report and history.

## Backend connection

| Method | Endpoint | Features | Purpose |
|--------|----------|----------|---------|
| `GET` | `/api/llm/visibility` | `local_growth` + `reporting` | Latest report + history |
| `POST` | `/api/llm/visibility/chatgpt`, `/claude`, `/perplexity` | same | Ask that LLM (web search on, UK) the 5 questions via DataForSEO |
| `POST` | `/api/llm/visibility/google` | same | Fetch Google AI Overview for the 5 questions |
| `POST` | `/api/llm/visibility/analyze` | same | Gemini reads the answers (mentions, position, sentiment, competitors, opportunities); scores computed in `backend/lib/aiInsights.ts` |

State is stored as `llmVisibility` / `llmVisibilityHistory` (last 20) in the org dashboard state. Older `aiVisibility` / `aiVisibilityHistory` values are still read until the next check overwrites them.

If Gemini is unavailable, mentions are still detected by matching the business name / website domain, and sentiment defaults to neutral.

## External APIs needed

| API | Env | Role |
|-----|-----|------|
| DataForSEO AI Optimization (LLM Responses: ChatGPT, Claude, Perplexity) | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Answers. Models: `gpt-4.1-mini`, `claude-haiku-4-5`, `sonar`; override with `DATAFORSEO_CHATGPT_MODEL`, `DATAFORSEO_CLAUDE_MODEL`, `DATAFORSEO_PERPLEXITY_MODEL` |
| DataForSEO SERP (Google organic, `load_async_ai_overview`) | same | Google AI Overview text + cited sources |
| Google Gemini | `GEMINI_API_KEY` | Answer analysis |

Each check bills 5 calls per LLM (15 total) plus 5 Google SERP calls (+ the AI Overview surcharge) on DataForSEO, so it is run on demand only.

If Gemini analysis is unavailable, position, context and competitors are worked out from the answer text itself: business-like names (links, bold text, list entries, names ending in words such as Clinic / Dental / Aesthetics, or starting with Dr) are listed in the order they appear, and position is where this business falls in that order (1 = named first). Advice headings such as "Range of Services" are ignored.

## Why there is no Gemini card

Gemini was removed as a platform: it shared the same Gemini API quota as the analysis step, and a 429 quota error on one broke the other. Google AI Overviews (via DataForSEO) covers Google. 0% there is common for local searches, where Google shows the Map Pack instead of an overview.

Mention rate can differ between runs (for example 40% then 100%): LLM answers are not deterministic and each check only asks 5 questions, so each run is a sample.

## History

The Past checks box shows the latest 5 runs. Each row has a delete (trash) icon: `DELETE /api/llm/visibility/history?createdAt=...`.
