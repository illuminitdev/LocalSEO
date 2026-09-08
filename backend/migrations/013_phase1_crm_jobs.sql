-- Phase 1 Jobber core: Client CRM + job/intake fields on bookings

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('lead', 'active', 'inactive')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_email_lower
    ON clients (org_id, lower(email))
    WHERE email IS NOT NULL AND trim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_clients_org_name ON clients (org_id, name);

CREATE TABLE IF NOT EXISTS client_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_properties_client ON client_properties (client_id);

ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES client_properties(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS job_status TEXT,
    ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS preferred_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS intake_type TEXT NOT NULL DEFAULT 'instant'
        CHECK (intake_type IN ('instant', 'request')),
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS internal_notes TEXT NOT NULL DEFAULT '';

-- Backfill job_status from legacy payment status
UPDATE bookings SET job_status = 'cancelled' WHERE job_status IS NULL AND status = 'cancelled';
UPDATE bookings SET job_status = 'completed' WHERE job_status IS NULL AND status = 'done';
UPDATE bookings SET job_status = 'scheduled'
    WHERE job_status IS NULL AND status IN ('confirmed', 'awaiting_payment');
UPDATE bookings SET job_status = 'scheduled' WHERE job_status IS NULL;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Backfill clients from existing booking guest fields
INSERT INTO clients (org_id, name, email, phone, status)
SELECT DISTINCT ON (b.org_id, lower(b.customer_email))
    b.org_id,
    COALESCE(NULLIF(trim(b.customer_name), ''), 'Customer'),
    lower(trim(b.customer_email)),
    COALESCE(b.customer_phone, ''),
    'active'
FROM bookings b
WHERE trim(COALESCE(b.customer_email, '')) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM clients c
      WHERE c.org_id = b.org_id AND lower(c.email) = lower(trim(b.customer_email))
  )
ORDER BY b.org_id, lower(b.customer_email), b.created_at;

-- One property per client from latest address on their bookings
INSERT INTO client_properties (client_id, address)
SELECT c.id, COALESCE(sub.addr, '')
FROM clients c
JOIN LATERAL (
    SELECT trim(b.customer_address) AS addr
    FROM bookings b
    WHERE b.org_id = c.org_id AND lower(trim(b.customer_email)) = lower(c.email)
      AND trim(COALESCE(b.customer_address, '')) <> ''
    ORDER BY b.created_at DESC
    LIMIT 1
) sub ON TRUE
WHERE NOT EXISTS (SELECT 1 FROM client_properties p WHERE p.client_id = c.id);

UPDATE bookings b
SET client_id = c.id
FROM clients c
WHERE b.client_id IS NULL
  AND c.org_id = b.org_id
  AND trim(COALESCE(b.customer_email, '')) <> ''
  AND lower(c.email) = lower(trim(b.customer_email));

UPDATE bookings b
SET property_id = p.id
FROM client_properties p
JOIN clients c ON c.id = p.client_id
WHERE b.property_id IS NULL
  AND b.client_id = c.id
  AND p.client_id = c.id;

UPDATE invoices i
SET client_id = b.client_id
FROM bookings b
WHERE i.booking_id = b.id
  AND i.client_id IS NULL
  AND b.client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings (client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_job_status ON bookings (org_id, job_status);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices (client_id);
