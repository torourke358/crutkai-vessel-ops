-- ============================================
-- Thor — GA pin coords on equipment + standard yacht systems seed
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu
-- Safe to re-run.
-- ============================================

-- 1) GA pin: stored as percentages (0..100) of the schematic image dims so
--    coordinates survive any future image swap or screen resolution.
alter table equipment
  add column if not exists ga_x numeric(6,3) check (ga_x is null or (ga_x >= 0 and ga_x <= 100)),
  add column if not exists ga_y numeric(6,3) check (ga_y is null or (ga_y >= 0 and ga_y <= 100));

create index if not exists idx_equipment_ga_pinned
  on equipment(active)
  where ga_x is not null and ga_y is not null;

-- 2) Rename loose existing entries to canonical names. Use lower() match so
--    the migration is idempotent. Skip if the canonical name is already
--    present so we don't violate the unique code constraint.
update components
   set name = 'Air conditioning'
 where lower(name) = 'ac'
   and not exists (select 1 from components c2 where lower(c2.name) = 'air conditioning');

update components
   set name = 'Electrical'
 where lower(name) = 'electric'
   and not exists (select 1 from components c2 where lower(c2.name) = 'electrical');

-- 3) Standard 100-110 ft motor yacht systems list, seeded as a starting
--    point. ON CONFLICT DO NOTHING preserves anything Craig has already
--    edited and any inventory items already wired to existing rows.
insert into components (code, name, display_order, active) values
  -- propulsion + drive
  ('main_engines',       'Main engines',         100, true),
  ('gearbox',            'Gearbox / transmission', 110, true),
  ('shafts_propellers',  'Shafts & propellers',  120, true),
  ('steering',           'Steering & rudders',   130, true),
  ('stabilizers',        'Stabilizers',          140, true),
  ('thrusters',          'Bow & stern thrusters', 150, true),

  -- power generation + distribution
  ('generators',         'Generators',           200, true),
  ('shore_power',        'Shore power',          210, true),
  ('batteries_inverters', 'Batteries & inverters', 220, true),

  -- HVAC
  ('hvac_ventilation',   'HVAC ventilation',     310, true),
  ('refrigeration',      'Provision refrigeration', 320, true),

  -- fuel + fluids
  ('fuel_system',        'Fuel system',          400, true),
  ('lube_oil',           'Lube oil',             410, true),
  ('cooling_water',      'Cooling water (HT/LT)', 420, true),
  ('compressed_air',     'Compressed air',       430, true),

  -- water + waste
  ('fresh_water',        'Fresh water',          500, true),
  ('water_maker',        'Water maker',          510, true),
  ('gray_water',         'Gray water',           520, true),
  ('black_water',        'Black water / sanitation', 530, true),
  ('bilge',              'Bilge',                540, true),

  -- deck
  ('anchor_windlass',    'Anchor & windlass',    600, true),
  ('tender_davit',       'Tender & davit',       610, true),
  ('lines_lockers',      'Lines & deck lockers', 620, true),

  -- safety / regulatory
  ('fire_suppression',   'Fire suppression',     700, true),
  ('liferafts_epirb',    'Liferafts & EPIRB',    710, true),

  -- electronics
  ('navigation',         'Navigation electronics', 800, true),
  ('communications',     'Communications',       810, true),

  -- hotel
  ('galley_appliances',  'Galley appliances',    900, true),
  ('laundry',            'Laundry',              910, true)
on conflict (code) do nothing;
