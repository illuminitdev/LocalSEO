-- Plan change scheduled for the end of the current billing period (Stripe subscription schedule).
-- The current plan keeps its features until then; the webhook moves plan_id over and clears these.
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS pending_plan_id TEXT NULL,
    ADD COLUMN IF NOT EXISTS pending_plan_starts_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS stripe_schedule_id TEXT NULL;
