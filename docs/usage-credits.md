# Usage credits

## What it does

Every scan, rank check and AI report in the Local SEO features calls a paid service (DataForSEO), so each plan gets a **monthly credit pool**. **1 credit = 1 DataForSEO call.** Viewing saved results is always free; only the Run / Scan / Refresh / Sync buttons spend credits.

When the pool is empty the action is blocked with a message ("You have used all your credits for this month") until the pool resets. There is no upgrade or credit-pack flow yet.

## Credit costs

Defined once in `backend/lib/planCatalog.ts` (`CREDIT_COSTS`), mirrored in `client/src/shared/planCatalog.ts`. The API also returns the live values in `GET /api/credits`.

| Action | Credits | Notes |
|--------|---------|-------|
| Rank Tracker scan (hidden 3x3 grid) | 9 | Charged at `scan-start`; cells that fail to load are refunded once at `scan-finish` |
| Visibility Tracker check | 1 per keyword | Keywords checked in the last 24h are skipped and not charged; failed checks are refunded |
| Typed keyword suggestions (`?q=`) | 1 per new search | Same search is free for 7 days; the starting suggestion list is cached for 7 days |
| AI Insights refresh | 6 | Charged at `/plan`; refunded if `/finish` fails |
| LLM Visibility | 1 per new answer (up to 20) | 5 questions x (ChatGPT, Claude, Perplexity, Google). Answers reused from the last 24h are free |
| LLM Tracking check | 1 per new platform answer | Cached answers are free |
| Citations scan | 4 | Charged when a new scan starts; the polling calls are free |
| Google review sync | 1 | The first-visit automatic sync stays quiet if credits run out |

## Allowances

| Plan | Credits / month | Locations |
|------|-----------------|-----------|
| `local-presence` | 100 | 1 |
| `local-growth` | 1,000 | 3 |
| `complete-growth-system` | 2,000 | 10 |

Automatic keyword checks are turned off on every plan; keywords are only checked (and charged) when the user clicks Check. See [visibility-tracker.md](visibility-tracker.md).

Booking-only plans have no pool. `ENTITLEMENTS_DISABLED=true` (dev) means unlimited.

The pool follows the **subscription billing period** (`currentPeriodStart` / `currentPeriodEnd` from the active subscription). Without those dates it falls back to the calendar month (UTC). It resets when the period changes and does not roll over.

**Cost safety rule:** a fully used pool should cost at most about 20% of the plan price. After the first week of `[dfs-cost]` log lines (see below), if an action averages more than about $0.02 per credit, raise that action's credit cost instead of lowering the pool.

## Cooldown

The same keyword at the same location can only be scanned or checked once every 24 hours (`SCAN_COOLDOWN_HOURS`). The API answers **429** with `code: "cooldown"` and `nextAvailableAt`. The AI Insights refresh also waits 24 hours.

## Backend

| Piece | File |
|-------|------|
| Spend / refund / usage / cooldown helpers | `backend/lib/credits.ts` |
| Costs, allowances, limits | `backend/lib/planCatalog.ts` |
| Tables | `backend/migrations/036_usage_credits.sql` (`org_credits`, `usage_ledger`) |

`spend()` is one guarded `UPDATE ... WHERE used + n <= allowance`, so two requests at once can never spend more than the allowance. Every spend and refund is also written to `usage_ledger` (refunds are negative rows).

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/credits` | `{ allowance, used, remaining, periodEnd, costs, breakdown }` for the usage bar |

Errors: **402** `insufficient_credits` (`cost`, `remaining`, `periodEnd`), **429** `cooldown` (`nextAvailableAt`).

Multi-step runs are protected so one payment cannot be reused: a rank scan returns a `scanId` that every `scan-row` call must carry (`hasRecentCharge`, and `registerCall` caps the number of cell requests); AI Insights `pack` / `trends` only run inside the 15-minute window opened by `/plan`.

## Frontend

- `client/src/shared/CreditsContext.tsx` loads `/api/credits` and exposes `refresh()` and `costOf()`.
- **Account settings → Usage tab** (`client/src/features/account/UsagePanel.tsx`, `/account#usage`): credits left, reset date, credits used per feature this month, a "what each action uses" table, and the keyword and cooldown rules. The tab only shows for plans with a credit pool.
- **Low-credit banner** (`client/src/shared/LowCreditsBanner.tsx`, mounted in `Layout.tsx`): appears only at 10% or less (can be dismissed for the session) and when credits are used up (not dismissible). It links to the Usage tab. Nothing shows at normal levels.
- Buttons do **not** show credit costs. Pages call `refreshCredits()` after paid actions, so the Usage tab and banner stay current.
- When credits run out the action is blocked with one plain message ("You've used all your credits for this month. They reset on 1 Nov.") from `client/src/shared/creditMessages.ts`.
- `readError` in `client/src/shared/utils.ts` now exposes `err.status`, `err.code` and `err.body` so pages can react to `insufficient_credits` and `cooldown`.

## Measuring real cost

Each DataForSEO response `cost` is logged as `[dfs-cost] <path> <cost>` from the four fetch helpers. Read the logs in CloudWatch for about a week to confirm the per-call cost and tune credit costs.

## Out of scope for now

Buying extra credits, plan upgrades, and an admin usage page (the `usage_ledger` table already holds what it will need).
