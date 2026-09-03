# ZappSites Payment — Autopay / monthly plan setup (prompt for the Payment agent)

Copy everything below into a Cursor chat on the **ZappSites Payment** repo.

---

## Goal

When a customer buys a ZappSites plan, they must get a **real Stripe monthly Subscription** (not a one-time charge only). That is what charges the card again after one month. The Local SEO portal (LocalPulse / app.zappsites.com) already:

- Shows only services for the plan
- Cuts access when `current_period_end` is past
- Lets the customer/admin turn **autopay off** (`cancel_at_period_end`)
- Syncs Stripe events at `POST {LOCAL_SEO_API}/api/webhooks/stripe` for `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`

Your job on **Payment** is the money + invite + email side.

## Required behaviour

1. **Checkout** creates a Stripe **Subscription** with `collection_method=charge_automatically`, interval **month**, matching the plan price.
2. On successful payment / subscription create, write shared RDS rows:
   - `subscriptions`: `plan_id`, `status='active'`, `customer_email`, `stripe_subscription_id`, `stripe_customer_id`, `current_period_start`, `current_period_end` (from Stripe), `cancel_at_period_end=false` (autopay on by default). `org_id` may be null until first portal login.
   - `portal_invites`: email, name, phone, `plan_id`, temp password hash (SHA-256 hex of temp password — LocalPulse expects this), `stripe_subscription_id`, `status='paid'`, `features` optional jsonb, `must_change_password` true.
3. **Email login details from `info@zappsites.com`**: portal URL (e.g. https://app.zappsites.com), email, temporary password. Set `credentials_emailed_at` when sent.
4. Ensure Stripe webhooks for subscription renewals either:
   - Hit the Local SEO API webhook URL above, **or**
   - Update the same `subscriptions` row periods/status/`cancel_at_period_end` in shared RDS yourselves on renew/cancel.
5. If the customer turns off autopay in the portal, LocalPulse calls `stripe.subscriptions.update(id, { cancel_at_period_end: true })`. Payment must not overwrite that flag back to false on unrelated updates.
6. Do **not** use one-time Checkout-only mode for portal plans if you want monthly auto-charge. One-time payment = no next-month charge.

## Plan IDs (must match LocalPulse catalog)

`website-essential`, `booking-solo`, `booking-solo-plus`, `booking-pro`, `local-presence`, `local-growth`, `complete-growth-system`

## DB note

LocalPulse migration adds `subscriptions.cancel_at_period_end BOOLEAN NOT NULL DEFAULT false`. If Payment owns the schema, add the same column.

## Acceptance checks

- Buy plan → Stripe Subscription exists → invite email from info@zappsites.com → login to Local SEO → only that plan’s services show.
- After renew (`invoice.paid`) → `current_period_end` moves forward → services stay.
- Autopay off in portal → Stripe `cancel_at_period_end=true` → no charge next month → after period end, portal services gone.
