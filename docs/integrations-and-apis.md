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
| `GEMINI_API_KEY` | Dev / local AI key (optional free/test) |
| `GEMINI_API_KEY_PROD` | **Paid** key — CDK injects into LocalSeoApi-**prod** only |
| `GEMINI_TEXT_MODEL` | Optional override |
| `GEMINI_IMAGE_MODEL` | Optional override |

**Stage rule:** Never put the paid Gemini key in `GEMINI_API_KEY` (that is what LocalSeoApi-dev gets). Use `GEMINI_API_KEY_PROD` for `cdk deploy -c stage=prod`.

**Used by:** profile audit, posts, media, reviews, Q&A, citations, gap analysis, strategy report, Places search fallback.

Package: `@google/genai` in `backend/server.ts`.

---

## 3. Google Places (server API key)

| Env | Purpose |
|-----|---------|
| `GOOGLE_PLACES_API_KEY` | Preferred server key for listing search |
| `GOOGLE_MAPS_API_KEY` | Accepted alias |

**Used by:** business connect / search, competitor nearby for Local Search Grid.

Enable Places API (New) on the GCP project. Code: `backend/lib/googlePlaces.ts`.

Health: `GET /api/status` → `{ places: true/false, gemini: true/false }`.

This is **not** the browser Maps JavaScript key (see §3b).

---

## 3b. Maps JavaScript (optional embedded map UI)

| Env | Purpose |
|-----|---------|
| `VITE_GOOGLE_MAPS_JS_KEY` | Browser key for Maps JavaScript API |

**Used by:** optional map on Account connected location + Places search results (`client/src/components/PlacesMap.tsx`).

If unset, the map is hidden (no script load). Create the key in GCP → enable **Maps JavaScript API** → restrict by **HTTP referrers** (`localhost:5173`, `app.zappsites.com`, staging hosts).

Do **not** reuse the Places server key in the browser.

---

## 4. Google Calendar (OAuth)

| Env | Purpose |
|-----|---------|
| `GOOGLE_CLIENT_ID` | OAuth client |
| `GOOGLE_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_REDIRECT_URI` | Local Express callback (default `http://localhost:5000/api/integrations/google/callback`) |
| `API_BASE_URL` | Builds Lambda redirect if deploy URI unset |

**Used by:** Bookings host calendar sync only (`bookings` feature).

Scopes: `calendar` + `calendar.events`. Tokens stored in `calendar_connections`.

### GCP setup checklist

1. Enable **Google Calendar API** on the OAuth client’s GCP project.
2. OAuth consent screen: add Calendar scopes; add test users while in Testing.
3. Web application client → Authorized redirect URIs:
   - `http://localhost:5000/api/integrations/google/callback`
   - `https://ud9zl0ww6d.execute-api.us-east-1.amazonaws.com/api/integrations/google/callback`
   - `https://zw8pq7vyi2.execute-api.us-east-1.amazonaws.com/api/integrations/google/callback`
4. Put client ID + secret in `backend/.env` (CDK injects them into both stages; Lambda uses stage API base for redirect, not localhost).
5. Portal: **Booking → Settings → Integrations → Connect** (Google).

Places listing “connect” still uses the Places **API key** search, not this OAuth pair. Real GBP publish is a separate feature.

---

## 5. Stripe Connect (booking deposits + platform commission)

| Env | Purpose |
|-----|---------|
| `STRIPE_SECRET_KEY` | **Test** secret (`sk_test_…`) — LocalSeoApi-**dev** / local only |
| `STRIPE_PUBLISHABLE_KEY` | **Test** publishable (`pk_test_…`) — dev only |
| `STRIPE_WEBHOOK_SECRET` | **Test** webhook signing secret (`whsec_…`) — dev only |
| `STRIPE_SECRET_KEY_PROD` | **Live** secret (`sk_live_…`) — CDK `-c stage=prod` only |
| `STRIPE_PUBLISHABLE_KEY_PROD` | **Live** publishable (`pk_live_…`) — prod only |
| `STRIPE_WEBHOOK_SECRET_PROD` | **Live** webhook secret — prod only |
| `STRIPE_PLATFORM_FEE_BPS` | Application fee in basis points (**default `500` = 5%**) |
| `STRIPE_CONNECT_RETURN_URL` | Optional override after Connect onboarding |
| `STRIPE_CONNECT_REFRESH_URL` | Optional override if Account Link expires |
| `STRIPE_CONNECT_DEFAULT_COUNTRY` | Connected account country (default `GB`) |

Never hardcode Stripe secrets in source or commit `.env`. CDK injects test keys on `stage=dev` and `*_PROD` keys on `stage=prod` only.

**Used by:** Connect onboarding for hosts, paid public booking deposits (direct charges + application fee), host invoices, checkout verify.

**Connect:** each booking org stores `stripe_account_id` / `stripe_charges_enabled`. Deposits charge the connected account; platform receives `application_fee_amount`.

**Not used for:** ZappSites plan subscription checkout (that lives on ZappSites Payment API).

**Do not** paste live publishable/restricted keys from client Word docs into this app. Hosts connect via **Stripe Connect Express** in the booking demo.

### Platform commission (QR / public book)

`STRIPE_PLATFORM_FEE_BPS=500` → **5% of the deposit**.

| Customer deposit | Platform (you) | Host (before Stripe card fees) |
|------------------|----------------|--------------------------------|
| £20 | £1.00 | £19.00 |
| £50 | £2.50 | £47.50 |
| £100 | £5.00 | £95.00 |

Stripe’s own processing fee is separate. Change cut later by editing `STRIPE_PLATFORM_FEE_BPS` (e.g. `1000` = 10%).

### Test-mode Dashboard checklist

1. Stripe Dashboard → **Test mode** ON.
2. Enable **Connect** (Express) on the platform account.
3. Webhook endpoint → your API `/api/webhooks/stripe` with events: `checkout.session.completed`, `account.updated`, `invoice.paid`. Enable **listening to events on Connected accounts**.
   - Dev: `https://ud9zl0ww6d.execute-api.us-east-1.amazonaws.com/api/webhooks/stripe`
   - Prod: `https://zw8pq7vyi2.execute-api.us-east-1.amazonaws.com/api/webhooks/stripe`
4. Put test keys + webhook signing secret in `backend/.env`; redeploy so Lambda gets `STRIPE_WEBHOOK_SECRET`.
5. Host: **Booking → Settings → Integrations → Connect Stripe** → finish Express onboarding until charges enabled.
6. Customer uses QR / share link → pay deposit with test card `4242 4242 4242 4242`.
7. Verify: payment on **connected account**; **application fee** on **platform** test balance (= 5% of deposit).
8. Live later: Test mode OFF, live webhook, hosts re-onboard under Live — still via Connect, not by hardcoding live keys into the SPA.

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
| `VITE_GOOGLE_MAPS_JS_KEY` | Optional Maps JS browser key |

---

## 7. Deployed API bases (reference)

| Stage | API |
|-------|-----|
| Dev | `https://ud9zl0ww6d.execute-api.us-east-1.amazonaws.com` |
| Prod | `https://zw8pq7vyi2.execute-api.us-east-1.amazonaws.com` |

Portal prod: `https://app.zappsites.com`

CDK injects secrets from `backend/.env` at deploy time (never commit keys). See `backend/infra/lib/local-seo-api-stack.ts`.

---

## Module → API cheat sheet

| Module | Gemini | Places | Maps JS | Stripe | Google Calendar | RDS |
|--------|:------:|:------:|:-------:|:------:|:---------------:|:---:|
| Auth / account | | | ○ | | | ✓ |
| Dashboard | | | | | | ✓* |
| Business profile | ✓ | ✓ | ○ | | | ✓* |
| Citations / posts / media / reviews / Q&A | ✓ | † | | | | ✓* |
| Local Search Grid | ✓ | ✓ | | | | ✓* |
| AI Insights | ✓ | | | | | ✓* |
| Bookings | | | | ✓‡ | ✓‡ | ✓ |
| Admin | | | | | | ✓ |

\* App-state / users as applicable  
† Places for initial business/reviews  
‡ Optional but needed for paid bookings / calendar sync  
○ Optional embedded map when `VITE_GOOGLE_MAPS_JS_KEY` is set
