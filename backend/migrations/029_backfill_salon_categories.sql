-- Backfill salon service categories when empty (older setups stored category as '')
UPDATE event_types et
SET category = CASE
    WHEN LOWER(et.name) ~ '(course|cpd|train|class|diploma)' THEN 'Courses'
    WHEN LOWER(et.name) ~ '(makeup|make up|bridal makeup)' THEN 'Makeup'
    WHEN LOWER(et.name) ~ '(bb glow|hydrafacial|hydra facial|exilis|botox|filler|plasma|meso|microneedl|profound|ipl|laser|scalp pigmentation)' THEN 'Aesthetics'
    WHEN LOWER(et.name) ~ '(hair|cut|colour|color|blow|restyle|balayage|highlight|tint)' THEN 'Hair'
    WHEN LOWER(et.name) ~ '(facial|lash|brow|wax|massage|manicure|pedicure|nail|beauty|skin peel)' THEN 'Beauty'
    ELSE et.category
END
FROM organizations o
WHERE et.org_id = o.id
  AND COALESCE(NULLIF(TRIM(et.category), ''), '') = ''
  AND (
    LOWER(COALESCE(o.booking_industry_id, '')) = 'salons'
    OR LOWER(COALESCE(o.trade_type, '')) LIKE '%salon%'
    OR LOWER(COALESCE(o.trade_type, '')) LIKE '%beauty%'
  );
