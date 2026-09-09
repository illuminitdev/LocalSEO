-- Platform role: customer (default) vs sales_agent (no customer org/plan)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'customer';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_platform_role_check'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_platform_role_check
            CHECK (platform_role IN ('customer', 'sales_agent'));
    END IF;
END $$;
