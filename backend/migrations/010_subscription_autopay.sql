-- Autopay control: false = Stripe renews (charge next month); true = stop after current period
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
