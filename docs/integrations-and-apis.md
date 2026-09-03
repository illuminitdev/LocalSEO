# Integrations & external APIs

Master list of third-party services LocalPulse talks to, env vars, and which product modules need them.

## Connection pattern

```
client (VITE_API_BASE)
  → API Gateway / localhost:5000
  → Express (server.ts) or Lambda (lambda.ts)
  → RDS | Gemini | Places | Stripe | Google Calendar
```

Client env: `client/.env` / `.env.example`  
Server env: `backend/.env` / `.env.example`

---

## 1. Database (required)

Shared **ZappSites RDS** via Secrets Manager + RDS Proxy (Neon is not used).

| Env | Purpose |
|-----|---------|
| `SHARED_RDS=true` | Skip owning plans/subscriptions migrations |
| `DB_SECRET_ARN` | Credentials secret |
| `DB_PROXY_ENDPOINT` | Proxy host |
| `DB_NAME` / `DB_USER` | Database + user |
| `DATABASE_URL` | Local-only alternative when proxy empty |

Code: `backend/lib/db.ts`

---

## 2. Google Gemini (AI modules)

| Env | Purpose |
|-----|---------|
| `GEMINI_API_KEY` | Required for AI features |
| `GEMINI_TEXT_MODEL` | Optional override |
| `GEMINI_IMAGE_MODEL` | Optional override |

**Used by:** profile audit, posts, media, reviews, Q&A, citations, gap analysis, strategy report, Places search fallback.

Package: `@google/genai` in `backend/server.ts`.

---

## 3. Google Places

| Env | Purpose |
|-----|---------|
| `GOOGLE_PLACES_API_KEY` | Preferred |
| `GOOGLE_MAPS_API_KEY` | Accepted alias |

**Used by:** business connect / search, competitor nearby for Local Search Grid.

Enable Places API (New) on the GCP project. Code: `backend/lib/googlePlaces.ts`.

Health: `GET /api/status` → `{ places: true/false, gemini: true/false }`.

---

## 4. Google Calendar (OAuth)

| Env | Purpose |
|-----|---------|
| `GOOGLE_CLIENT_ID` | OAuth client |
| `GOOGLE_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_REDIRECT_URI` | Default `…/api/integrations/google/callback` |
| `API_BASE_URL` | Builds redirect if URI unset |

**Used by:** Bookings host calendar sync only (`bookings` feature).

Scopes: `calendar` + `calendar.events`. Tokens stored in `calendar_connections`.

---

## 5. Stripe

| Env | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | Server SDK (`sk_test_…` or `sk_live_…`) |
| `STRIPE_PUBLISHABLE_KEY` | Client / public payloads |
| `STRIPE_WEBHOOK_SECRET` | Verify `/api/webhooks/stripe` |
| `STRIPE_PLATFORM_FEE_BPS` | Application fee in basis points (default `500` = 5%) |
| `STRIPE_CONNECT_RETURN_URL` | Optional override after Connect onboarding |
| `STRIPE_CONNECT_REFRESH_URL` | Optional override if Account Link expires |
| `STRIPE_CONNECT_DEFAULT_COUNTRY` | Connected account country (default `GB`) |

**Used by:** Connect onboarding for hosts, paid public booking deposits (direct charges + application fee), host invoices, checkout verify.

**Connect:** each booking org stores `stripe_account_id` / `stripe_charges_enabled`. Deposits charge the connected account; platform receives `application_fee_amount`.

**Not used for:** ZappSites plan subscription checkout (that lives on ZappSites Payment API).

### Test-mode Dashboard checklist

1. Stripe Dashboard → **Test mode** ON.
2. Enable **Connect** on the platform account.
3. Webhook endpoint → your API `/api/webhooks/stripe` with events: `checkout.session.completed`, `account.updated`, `invoice.paid`. Enable **listening to events on Connected accounts** for Connect checkout events.
4. Put test keys + webhook secret in backend env.
5. Host: Booking → Integrations → **Connect Stripe** → complete test onboarding.
6. Public book with test card `4242…` → deposit on connected account; application fee on platform test balance.
7. Live later: same code, swap to `sk_live_…` / live webhook; businesses onboard again under Live.
---

## 6. Auth / app URLs

| Env | Purpose |
|-----|---------|
| `JWT_SECRET` | Host JWT |
| `AUTH_REQUIRED` | Enforce auth middleware behavior |
| `CLIENT_ORIGIN` / `FRONTEND_URL` | CORS, links, OAuth return UX |
| `API_BASE_URL` | Public API base (emails, redirects) |
| `ENTITLEMENTS_DISABLED` | Dev bypass of plan gates |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin console |

Client:

| Env | Purpose |
|-----|---------|
| `VITE_API_BASE` | Backend origin |
| `VITE_STAGE` | `dev` / `prod` |
| `VITE_MARKETING_URL` | ZappSites marketing |

---

## 7. Deployed API bases (reference)

| Stage | API |
|-------|-----|
| Dev | `https://ud9zl0ww6d.execute-api.us-east-1.amazonaws.com` |
| Prod | `https://zw8pq7vyi2.execute-api.us-east-1.amazonaws.com` |

Portal prod: `https://app.zappsites.com`

---

## Module → API cheat sheet

| Module | Gemini | Places | Stripe | Google Calendar | RDS |
|--------|:------:|:------:|:------:|:---------------:|:---:|
| Auth / account | | | | | ✓ |
| Dashboard | | | | | ✓* |
| Business profile | ✓ | ✓ | | | ✓* |
| Citations / posts / media / reviews / Q&A | ✓ | † | | | ✓* |
| Local Search Grid | ✓ | ✓ | | | ✓* |
| AI Insights | ✓ | | | | ✓* |
| Bookings | | | ✓‡ | ✓‡ | ✓ |
| Admin | | | | | ✓ |

\* App-state / users as applicable  
† Places for initial business/reviews  
‡ Optional but needed for paid bookings / calendar sync
