-- Allow stacked active subscriptions (one org can have multiple active plans).
DROP INDEX IF EXISTS subscriptions_org_active;
