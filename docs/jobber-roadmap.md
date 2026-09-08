# Jobber roadmap (LocalPulse)

Phased plan from the Jobber-parity product spec.

## Done

### Phase 1 — Core booking + CRM
- Basic Clients CRM, request intake, job statuses, Stripe Connect invoices linked to clients
- See [bookings.md](./bookings.md)

### Phase 2 — Client portal + email automation
- Client hub, email reminders, Settings → Reminders

### Module 2 — Quoting
- Quotes builder, public approve/decline, Connect deposit, follow-up email

### Phase 2 polish
- **Multi-property CRM**: labels, add/remove properties, quote/job property pick
- **Account avatar + job media**: S3 bucket `localseo-{stage}-media-*` (CDK), presigned upload
- **SMS + Inbox**: outbound Amazon SNS (`sns:Publish`); host Inbox for outbound history/replies; enable in Reminders → SMS. Not two-way (no inbound).

### Phase 3 — Team + Dispatch
- Team invites/roles, Dispatch week calendar (drag reschedule), assign tech, route order + Google Maps link + **map pins** (`VITE_GOOGLE_MAPS_JS_KEY`)

### Phase 4 — Costing + money
- Job expenses/time APIs + profit summary; **Jobs & money** dashboard + expenses CSV export

### Phase 5 — Marketing
- Public mini-site `/s/:orgSlug`, campaigns (SES), client referral codes

### Remaining polish (no Twilio)
- **Client merge**: `POST /api/host/clients/merge` + Clients detail UI
- **Field**: `/field` GPS check-in, signature, photos; tech role gate on assigned jobs
- **Zapier**: org webhook URL + HMAC; events booking.created/completed, quote.approved, invoice.paid
- **QuickBooks**: OAuth (`QBO_CLIENT_ID` / `QBO_CLIENT_SECRET`) + push paid invoice summary; Settings → Integrations
## Still out of scope / deferred

- **Pricing:** Starter/Growth/Pro catalog + Stripe/ZappSites price matching (not finalized)
- Twilio / two-way SMS (SNS outbound kept)
- Offline field sync, fleet tracking
- Full bidirectional QBO accounting

## Migrations

`016_phase2_polish.sql` · `017_phase3_team_dispatch.sql` · `018_phase4_costing.sql` · `019_phase5_marketing.sql` · `020_sms_sns.sql` · `021_field_integrations.sql`

Gate remains **`bookings`** for Booking Plots surfaces.
