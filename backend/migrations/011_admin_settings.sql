CREATE TABLE IF NOT EXISTS admin_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    password_hash TEXT NOT NULL,
    avatar_url TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_settings
    ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
