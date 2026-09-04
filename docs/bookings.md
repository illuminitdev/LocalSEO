# Bookings (Booking Plots)

## What it does

End-to-end **online booking** for service businesses:

- Host configures organization, event types, weekly availability
- Optional **Google Calendar** sync
- Optional **Stripe** checkout for paid bookings / invoices
- Public booking pages for customers (`/book/:hostSlug/...`)
- Manage / cancel / reschedule via magic token
- Host board to complete, cancel, or invoice bookings

## Feature gate

Host UI & host/integration APIs: **`bookings`**

Public customer booking (`/api/public/*`) is **not** entitlement-gated.

Plans: `booking-solo`, `booking-solo-plus`, `booking-pro`, `complete-growth-system`.

## Frontend

| UI | Path |
|----|------|
| Booking board | `client/src/pages/BookingPlots.tsx` → `/booking` |
| Schedule settings panel | `client/src/components/BookingSettingsPanel.tsx` |
| Dedicated settings route | `/booking/settings` → `BookingSettings.tsx` |
| Public host / event | `client/src/pages/PublicBook.tsx` → `/book/:hostSlug`… |
| Booking flow | `client/src/components/CustomerBookingFlow.tsx` |
| Success / ICS | `client/src/pages/BookSuccess.tsx` |
| Manage booking | `client/src/pages/BookManage.tsx` → `/book/manage/:token` |

## Backend connection

### Host API — `/api/host` (`backend/routes/host.ts`)

Requires host auth + `bookings` feature (via router middleware).

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/host/dashboard` | Org, events, bookings snapshot (+ `stripeConnect` status) |
| `POST` | `/api/host/setup` | Initial booking org setup |
| `POST` | `/api/host/reset` | Reset booking setup |
| `GET` | `/api/host/stripe/status` | Connect account status (refreshes from Stripe) |
| `POST` | `/api/host/stripe/connect` | Create Connect account + Account Link URL |
| `POST` | `/api/host/stripe/dashboard` | Express Dashboard login link |
| `GET/POST/PATCH/DELETE` | `/api/host/event-types`… | Event type CRUD |
| `GET/PUT` | `/api/host/availability` | Weekly windows |
| `PATCH` | `/api/host/organization` | Org / booking settings |
| `PATCH` | `/api/host/bookings/:id` | Update booking |
| `POST` | `/api/host/bookings/:id/cancel` | Cancel |
| `POST` | `/api/host/bookings/:id/complete` | Mark complete |
| `POST` | `/api/host/bookings/:id/invoice` | Create Stripe invoice |

### Public API — `/api/public` (`backend/routes/public.ts`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/public/:hostSlug` | Public host page data |
| `GET` | `/api/public/:hostSlug/:eventSlug` | Event page |
| `GET` | `/api/public/:hostSlug/:eventSlug/availability` | Open slots |
| `POST` | `/api/public/:hostSlug/:eventSlug/book` | Create booking (± Stripe session) |
| `GET` | `/api/public/checkout/verify` | Verify Stripe session |
| `GET` | `/api/public/manage/:token` | Guest manage view |
| `POST` | `/api/public/manage/:token/cancel` | Guest cancel |
| `POST` | `/api/public/manage/:token/reschedule` | Guest reschedule |
| `GET` | `/api/public/bookings/:id/calendar.ics` | ICS download |

### Google Calendar — `/api/integrations` (`backend/routes/integrations.ts`)

| Method | Endpoint | Feature |
|--------|----------|---------|
| `GET` | `/api/integrations/google/start` | `bookings` — OAuth URL |
| `GET` | `/api/integrations/google/callback` | OAuth return |
| `GET` | `/api/integrations/google/status` | Connected? |

### Stripe webhook

`POST /api/webhooks/stripe` — `checkout.session.completed` / `invoice.paid` / `account.updated` (`backend/routes/webhooks.ts`).

For Connect deposits, enable the webhook to receive **Connected account** events (or a Connect endpoint) so checkout completion still arrives.

## Stripe Connect (booking deposits)

Direct charges on the business’s connected Express account + platform `application_fee_amount`.

**Platform commission:** `STRIPE_PLATFORM_FEE_BPS` default **500 = 5%** of the deposit (QR / share / public book). Example: £50 deposit → **£2.50** to platform, £47.50 to host (before Stripe card fees).

### Stripe Dashboard steps (test mode)

1. Apply migration `009_stripe_connect.sql` (auto via `migrate()` / `npm run migrate` in backend).
2. Stripe Dashboard → **Test mode ON** → enable **Connect** (Express).
3. Webhooks → Add endpoint:
   - Dev: `https://ud9zl0ww6d.execute-api.us-east-1.amazonaws.com/api/webhooks/stripe`
   - Prod: `https://zw8pq7vyi2.execute-api.us-east-1.amazonaws.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `account.updated`, `invoice.paid`
   - Enable **listening to events on Connected accounts**.
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET` in `backend/.env`; redeploy API.
5. Keep existing **test** `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY`. Do **not** paste live keys from client Word docs — hosts onboard via Connect.
6. Host → **Booking → Settings → Integrations → Connect Stripe** → finish onboarding until charges enabled.
7. Customer books via QR/share → Checkout on `acct_…` → deposit to business; **5%** application fee to platform.
8. Verify in Stripe Test Dashboard: payment on connected account; application fee on platform balance.

Without Connect ready, `POST .../book` returns `stripe_not_connected` (does not charge the platform account).

Simulated mode (no `STRIPE_SECRET_KEY`) still auto-confirms bookings.

Live later: same code, swap to live keys + live webhook; businesses re-onboard under Live Connect.

### Cancel & refund (money split)

Host **Cancel & refund** or customer manage-link cancel refunds the **Connect direct charge** on the host’s Express account (must pass `stripeAccount`).

| Who | On successful deposit (£45 example, 5% fee) | After cancel + refund |
|-----|---------------------------------------------|------------------------|
| **Customer** | Pays £45 | Gets **£45** back on card |
| **Platform (you)** | Keeps **£2.25** application fee | **Still keeps £2.25** (`refund_application_fee: false`) |
| **Host** | ~£45 − £2.25 − Stripe card fee | Balance reduced by full refund; fee already sent to platform is not returned to host |
| **Stripe** | Card processing fee | Usually **keeps** processing fee (Stripe policy) |

Refunds appear in Stripe **Test mode** under the **connected account** payment (and platform Payments when viewing Connect charges). If refund ran without `stripeAccount`, it failed silently / never showed — that is fixed in `refundBookingDeposit`.

## Supporting libs

- `backend/lib/availability.ts` — slot math
- `backend/lib/confirmBooking.ts` — post-payment confirmation
- `backend/lib/bookingEmail.ts` — transactional email hooks
- `backend/lib/ics.ts` — calendar file
- `backend/lib/invoices.ts` — Stripe invoices
- `backend/lib/stripeConnect.ts` — Connect account links, fee, status sync
- `backend/lib/googleCalendar.ts` — Calendar OAuth + events

## External APIs needed

| API | Env vars | Required? |
|-----|----------|-----------|
| Postgres | DB_* / `DATABASE_URL` | Yes |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_PLATFORM_FEE_BPS` (default 5%), Connect return URLs | For paid bookings / invoices |
| Google OAuth + Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Optional calendar sync — add redirect URIs in GCP (local + dev/prod API callback paths) |
| Frontend / API URLs | `FRONTEND_URL`, `CLIENT_ORIGIN`, `API_BASE_URL` | Emails, OAuth redirect, CORS |

## DB (LocalPulse migrations)

- `002_booking_setup.sql`, `003_availability_dates.sql`, `009_stripe_connect.sql`
- Tables for orgs (incl. Connect columns), event types, availability, bookings, invoices, calendar connections, manage tokens

## Connection diagram

```
Host SPA (/booking)
  → JWT + /api/host/*
  → Stripe Connect onboarding (Express Account Link)
  → RDS bookings schema
  → optional Google Calendar API
  → optional Stripe (invoices)

Customer (/book/...)
  → /api/public/* (no plan gate)
  → Stripe Checkout on connected account + application_fee
  → webhook → confirmBooking
  → email + ICS + optional Calendar event
```
