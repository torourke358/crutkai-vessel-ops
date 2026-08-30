-- ============================================
-- Runa — Round 1 (Craig) feedback: equipment cleanup
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu
-- Safe to re-run.
--
-- RUN ORDER: deploy the round1-craig-feedback app code FIRST (it no longer
-- reads or writes equipment.zone_id / is_ism / is_isps), THEN run this. The
-- backfill in Section 1 must happen before the column drop in Section 2 — they
-- are ordered correctly within this file, so just run the whole thing.
-- ============================================

-- --------------------------------------------
-- Section 1 — Consolidate Zone into "Location on vessel".
--
-- Equipment now has a single "Location on vessel" dropdown fed by vessel_zones,
-- and stores the chosen name string in equipment.location_on_vessel. Many rows
-- have a zone set but Location blank; copy the zone's name into Location so we
-- don't lose where those units live. Only fills blanks — never overwrites a
-- value someone already typed (those are kept as-is; conflicts are left for
-- manual review per CHANGES_round1.md).
--
-- Each backfilled row is logged to audit_log (action='update'), mirroring how
-- every app mutation is audited. The actor is an active admin; if none exists
-- the UPDATE still runs and the audit rows are simply skipped.
-- --------------------------------------------

with actor as (
  select id
  from user_profiles
  where role = 'admin' and active = true
  order by full_name
  limit 1
),
backfilled as (
  update equipment e
     set location_on_vessel = z.name
    from vessel_zones z
   where e.zone_id = z.id
     and (e.location_on_vessel is null or btrim(e.location_on_vessel) = '')
  returning e.id, z.name as new_location
)
insert into audit_log (user_id, entity_type, entity_id, action, before_state, after_state)
select a.id,
       'equipment',
       b.id,
       'update',
       jsonb_build_object('location_on_vessel', null),
       jsonb_build_object(
         'location_on_vessel', b.new_location,
         'migration', 'round1_backfill_location_from_zone'
       )
from backfilled b
cross join actor a;

-- --------------------------------------------
-- Section 2 — Drop the retired columns.
--
-- "Zone" was consolidated into Location (Section 1) and the ISM / ISPS flags
-- were removed at Craig's request. No app code, query, RLS policy, report, or
-- export references these columns anymore (grepped before dropping), so remove
-- them and their indexes. If you'd rather keep the columns around as dormant
-- data for now, you can skip this section — the app behaves identically either
-- way — but the recommended path is to drop them.
-- --------------------------------------------

drop index if exists idx_equipment_zone;
alter table equipment drop column if exists zone_id;

drop index if exists idx_equipment_ism;
drop index if exists idx_equipment_isps;
alter table equipment drop column if exists is_ism;
alter table equipment drop column if exists is_isps;
