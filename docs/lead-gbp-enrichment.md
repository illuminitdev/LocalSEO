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
- *GBP observation*: sales-agent tone, only the failed checks, max 3 (order: primary category, NAP,
  review replies, posting, services, secondary category).
- *AI visibility*: same failed checks, written as why they make ChatGPT/Gemini less likely to recommend the business.
- Written by Gemini; deterministic templates (`templateCopy`) are used if Gemini fails or times out.
- Every check result + evidence is saved in `sales_leads.enrich_checks`.

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

## Timing
About 20-40 s per lead (reviews and posts run in parallel with the website fetch), 5 leads at a time:
roughly 10 leads ~1 min, 50 leads ~5-8 min, 200 leads ~20-30 min.

## GBP URL formats
Full Maps place URLs, `maps.app.goo.gl` short links (redirects are followed), `?cid=` links and place IDs.
If no id can be extracted, the name from the URL (or the lead name) + address is used as the search keyword.

## Files
- `backend/lib/leadGbpScore.ts` - pure logic (checks -> priority, copy templates, URL parsing, NAP match); tests in `backend/tests/leadGbpScore.test.ts`
- `backend/lib/leadGbpEnrich.ts` - DataForSEO + website + Gemini + DB orchestration
- `backend/leadEnrich.ts` - Lambda entry
- `backend/migrations/037_sales_leads_gbp_enrich.sql` - `gbp_url`, `enrich_*` columns
- `client/src/sales-agent/ExcelLeadUploadModal.tsx` - template + GBP URL column parsing
