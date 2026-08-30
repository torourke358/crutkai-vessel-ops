-- ============================================
-- Runa — Vessel zones lookup + equipment.zone_id
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run.
-- ============================================

-- Lookup of physical zones on the vessel ("part of the ship"). Used as the
-- grouping axis on the equipment list. Separate from `components` which is
-- the "what kind of thing" axis (Main engines, HVAC, etc.).
create table if not exists vessel_zones (
  id            uuid primary key default uuid_generate_v4(),
  code          text unique not null,
  name          text not null,
  display_order int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table vessel_zones enable row level security;
drop policy if exists "Signed in reads vessel_zones" on vessel_zones;
create policy "Signed in reads vessel_zones" on vessel_zones
  for select using (auth.uid() is not null);
drop policy if exists "Admin writes vessel_zones" on vessel_zones;
create policy "Admin writes vessel_zones" on vessel_zones
  for all using (is_admin());

-- Seed defaults that match the labels already drawn on /public/ga-schematic.svg.
-- Admin can rename, reorder, or deactivate via /admin/zones.
insert into vessel_zones (code, name, display_order, active) values
  ('bow',           'Bow / Foredeck',  10, true),
  ('anchor',        'Anchor & Windlass', 20, true),
  ('crew_quarters', 'Crew Quarters',   30, true),
  ('vip',           'VIP Stateroom',   40, true),
  ('master',        'Master Stateroom', 50, true),
  ('engine_room',   'Engine Room',     60, true),
  ('guest_cabins',  'Guest Cabins',    70, true),
  ('lazarette',     'Lazarette',       80, true),
  ('aft_deck',      'Aft Deck',        90, true),
  ('swim_platform', 'Swim Platform',  100, true),
  ('galley',        'Galley',         110, true),
  ('main_saloon',   'Main Saloon · Dining', 120, true),
  ('pilot_house',   'Pilot House',    130, true),
  ('sky_lounge',    'Sky Lounge',     140, true),
  ('flybridge',     'Flybridge',      150, true)
on conflict (code) do nothing;

alter table equipment
  add column if not exists zone_id uuid references vessel_zones(id) on delete set null;

create index if not exists idx_equipment_zone on equipment(zone_id) where zone_id is not null;
