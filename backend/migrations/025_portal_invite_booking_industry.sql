-- Mirror ZappSites: portal_invites.booking_industry_id for claim/hydrate without Stripe
ALTER TABLE portal_invites
  ADD COLUMN IF NOT EXISTS booking_industry_id TEXT;
