# Lead GBP auto-enrichment (admin Excel upload)

Admin > Growth Audit Leads > **Upload Leads Spreadsheet**.

## What it does
The Excel template has a **GBP URL** column. When a row has a GBP URL and one or more of
*My Observation GBP*, *My Observation AI Visibility*, *Lead Oppurtunity* are empty, the backend
analyses the business after upload and fills **only the empty cells**. Rows without a GBP URL import
exactly as before; cells filled in the Excel are never overwritten.

## The 6 checks
| # | Check | Pass when |
|---|-------|-----------|
| 1 | Review replies | owner has replied to sampled reviews (DataForSEO reviews) |
| 2 | Services / products | services or products are listed on the GBP |
| 3 | Regular posting | a Google Post exists in the last 30 days |
| 4 | NAP matches website | GBP name, address and phone found on the lead's website (home + /contact, /contact-us, /about) |
| 5 | Primary category | set |
| 6 | Secondary category | at least one |

A check that cannot be measured (website unreachable, no reviews, API gap) is **not** counted as a gap.

## Priority
Passed 0-3 -> **High**, passed 4 -> **Medium**, passed 5-6 -> **Low**. Stored in `lead_opportunity` and
`opportunity_level`.

## Text
**GBP observation**: one numbered line for **every** failed check (no cap, in the order of the 6 checks), only what is
missing. Passed checks and matched NAP parts are never mentioned. It is built from the check results (no AI writing), so
it states exactly what was found, e.g.

```
1. No services or products listed on the profile
2. Not posting regularly on the profile: no Google posts in the last 30 days (last post 3 Oct 2025)
3. Phone number missing on the website (GBP: 0121 477 9799)
4. No secondary categories added, so they miss related searches
```
No posts at all reads "No Google posts on the profile (not posting at all)". NAP lines are per missing part (business name /
phone number / address, each with the value from the GBP).

**NAP accuracy.** The website text comes from the home page plus /contact, /contact-us, /about (and .html / -us variants),
including the page title, meta tags, JSON-LD and `tel:` links; HTML entities are decoded. Phone numbers are compared by
national digits, so `+44 (0)121 477 9799`, `0121-477-9799` and `01214779799` all match; names ignore punctuation, `&`/`and`,
`Ltd` and spaces. If the site cannot be read (blocked, down, or almost no text because it is built with JavaScript) NAP is
**not judged** instead of being reported as missing.

**AI visibility**: 4 local-search questions are asked to ChatGPT per lead (DataForSEO
`ai_optimization/chat_gpt/llm_responses/live`, via `askLlm` in `aiInsights.ts`; platform can be changed with
`LEAD_AI_PLATFORM`). They are built from the lead's own GBP:
- the **business type** from the Excel "Business" column (e.g. "Windows & Doors" -> "windows and doors", the same for every row of a sheet); the GBP category is only a fallback when the Excel has none,
- the **city** and the **area/neighbourhood** (never a street) from the GBP address.

```
What are the best double glazing in Birmingham?
Who would you recommend for double glazing in Birmingham?
Who are the top rated double glazing in West Heath, Birmingham?
Which double glazing near West Heath should I choose?
```
For each answer the business counts as listed only if its full name (or website domain) is in it (a few shared words do
not match). If it is item N of a numbered list the rank is recorded.

The AI visibility column shows **every question with its result in brackets**: the rank when the business is named
(`(1st place)`, `(2nd place)`...), `(Listed)` when named without a rank, or `(Not Listed)`, e.g.

```
1. What are the best windows and doors in Birmingham? (Not Listed)
2. Who would you recommend for windows and doors in Birmingham? (2nd place)
```

In the lead details `(Not Listed)` is red and ranks are green (`shared/AiVisibilityText.tsx`). Questions that fail are left out
(all failed -> "AI visibility could not be checked right now.").

Every check result + evidence is saved in `sales_leads.enrich_checks`.

## Flow
1. `POST /api/admin/crm/leads/bulk-import` saves leads; rows to analyse get `enrich_status = 'pending'` and the
   response returns `enrichQueued`.
2. `triggerLeadEnrichment` runs the work in the background:
   - AWS: async-invokes the `localseo-lead-enrich-<stage>` Lambda (15 min, `backend/leadEnrich.ts`). It stops at ~12 min
     and re-invokes itself if leads remain.
   - Local dev (`LEAD_ENRICH_FN` unset): runs in-process.
3. Leads are claimed with `FOR UPDATE SKIP LOCKED` (5 at a time). `running` rows older than 20 min are retried.
4. Status per lead: `pending` -> `running` -> `done` | `failed` (reason in `enrich_error`).
   The leads page shows "Analyzing" / "GBP failed" and refreshes every 8 s while any lead is in progress.
   `GET /api/admin/crm/leads/enrich-status?batchId=` returns counts for a batch.
5. The worker Lambda has `LEAD_ENRICH_FN` set to its own name and permission to invoke itself; without that, the
   ~12 min continuation never runs and the rest of the batch stays on "Analyzing".
6. **Resume analysis** (leads page, shown while any lead is analysing) calls `POST /api/admin/crm/leads/enrich-resume`
   (`{ batchId }`, or all batches when no Excel file is selected). It restarts the worker for `pending` leads and
   `running` leads with no progress for 20+ min; leads already analysed are never re-run.

## Timing
About 20-40 s per lead (reviews and posts run in parallel with the website fetch), 5 leads at a time:
roughly 10 leads ~1 min, 50 leads ~5-8 min, 200 leads ~20-30 min.

## GBP URL formats
- **`share.google/...` links** (what Google's Share button gives). Browsers get a JavaScript-only page, so the server
  opens them with a plain user agent (`curl/8.0`); Google then redirects to a search URL containing the listing name
  (`q=`), which is used to find the profile. An expired link ends at `share.google/error`; the lead then falls back to the
  Excel name + address and, if that also fails, shows "This share.google link is invalid or expired".
- Full Google Maps place URLs, `maps.app.goo.gl` short links (redirects are followed), `?cid=` links and place IDs.
- If no id can be extracted, a name search is used: Google's listing name first, then the Excel name, each with the address /
  postcode / town. A result is only accepted if its title looks like the lead's name.

## Files
- `backend/lib/leadGbpScore.ts` - pure logic (checks -> priority, copy templates, URL parsing, NAP match); tests in `backend/tests/leadGbpScore.test.ts`
- `backend/lib/leadGbpEnrich.ts` - DataForSEO + website + ChatGPT (AI visibility) + DB orchestration
- `backend/leadEnrich.ts` - Lambda entry
- `backend/migrations/037_sales_leads_gbp_enrich.sql` - `gbp_url`, `enrich_*` columns
- `client/src/sales-agent/ExcelLeadUploadModal.tsx` - template + GBP URL column parsing
