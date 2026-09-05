-- Cleanup temporary DEV_CLIENT test account (client@email.com / Dev Client Business).
-- Run against the shared Local SEO / ZappSites Postgres database.
-- Preview first, then run the deletes in a transaction.

BEGIN;

-- 1) Preview
SELECT id, email, name FROM users WHERE LOWER(email) = 'client@email.com';
SELECT o.id, o.slug, o.name, o.email
FROM organizations o
WHERE LOWER(COALESCE(o.email, '')) = 'client@email.com'
   OR o.name = 'Dev Client Business'
   OR o.host_name = 'Dev Client';

-- 2) Subscriptions linked by email or org membership
DELETE FROM subscriptions
WHERE LOWER(COALESCE(customer_email, '')) = 'client@email.com'
   OR org_id IN (
        SELECT m.org_id
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE LOWER(u.email) = 'client@email.com'
   )
   OR org_id IN (
        SELECT o.id FROM organizations o
        WHERE o.name = 'Dev Client Business' OR o.host_name = 'Dev Client'
   );

-- 3) Orgs owned only by this user (memberships cascade from users; org rows need explicit delete)
WITH victim AS (
    SELECT id FROM users WHERE LOWER(email) = 'client@email.com'
),
orgs AS (
    SELECT DISTINCT m.org_id
    FROM memberships m
    JOIN victim v ON v.id = m.user_id
)
DELETE FROM organizations
WHERE id IN (SELECT org_id FROM orgs)
   OR name = 'Dev Client Business'
   OR host_name = 'Dev Client';

-- 4) User (memberships / password_resets cascade ON DELETE)
DELETE FROM users WHERE LOWER(email) = 'client@email.com';

COMMIT;
