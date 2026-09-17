-- Service category for salon (and other) event types e.g. Hair, Beauty, Aesthetics
ALTER TABLE event_types
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_event_types_org_category
  ON event_types (org_id, category);
