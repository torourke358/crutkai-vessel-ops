-- ============================================
-- Runa - Craig's storeroom categories + Bonig correction
-- Run in: Supabase Dashboard -> SQL Editor -> New query
-- Target: project ref trplphistdsfuecnnzdu
-- Safe to re-run.
-- ============================================
-- Applied live 2026-09-10 alongside the 516-row inventory import from
-- Craig's CSV export. Recorded here so the component list is reproducible
-- from the repo.

-- 1) CORRECTION TO 07_deactivate_bonig.sql -- DO NOT RE-RUN THAT FILE.
--    It deactivated "Bonig" on the assumption it was a Seahub OCR typo.
--    It is not: it is Boening (Boening Automationstechnologie), a marine
--    alarm / monitoring manufacturer. Craig sent a dedicated Bonig export
--    on 2026-09-10 and 7 inventory items reference it.
update components
   set active = true
 where lower(name) = 'bonig';

-- 2) Craig's own storeroom vocabulary, seeded from the distinct
--    "Related Component" values in his CSV export. These are deliberately
--    banded at 1000+ so they sort AFTER the canonical vessel systems
--    seeded at 100-910 by 09_components_systems_and_ga.sql, rather than
--    interleaving storeroom labels with engineered systems.
--
--    Six further CSV categories are NOT here because they are spelling
--    variants of existing components and were linked to those instead:
--      AC -> Air conditioning      Electric   -> Electrical
--      Engines -> Main engines     Generator  -> Generators
--      Watermaker -> Water maker   Tender     -> Tender & davit
--
--    Merge candidate for Craig: "Shaft" (1 item, shaft seals) overlaps the
--    canonical "Shafts & propellers".
insert into components (code, name, display_order, active) values
  ('appliances',              'Appliances',                1010, true),
  ('ceramic_coating',         'Ceramic coating',           1020, true),
  ('compression_hinge',       'Compression hinge',         1030, true),
  ('deck_equipment',          'Deck equipment',            1040, true),
  ('deck_polish_supply',      'Deck polish supply',        1050, true),
  ('deck_supplies',           'Deck supplies',             1060, true),
  ('dishes',                  'Dishes',                    1070, true),
  ('doors_and_hinges',        'Doors & hinges',            1080, true),
  ('electronics',             'Electronics',               1090, true),
  ('engine_room',             'Engine room',               1100, true),
  ('fans',                    'Fans',                      1110, true),
  ('festool',                 'Festool',                   1120, true),
  ('filter',                  'Filter',                    1130, true),
  ('fishing',                 'Fishing',                   1140, true),
  ('flags',                   'Flags',                     1150, true),
  ('freeman',                 'Freeman',                   1160, true),
  ('glassware',               'Glassware',                 1170, true),
  ('gost',                    'Gost',                      1180, true),
  ('heads',                   'Heads',                     1190, true),
  ('hinges_and_locks',        'Hinges & locks',            1200, true),
  ('horn',                    'Horn',                      1210, true),
  ('internet',                'Internet',                  1220, true),
  ('latches',                 'Latches',                   1230, true),
  ('mercury',                 'Mercury',                   1240, true),
  ('mtu',                     'MTU',                       1250, true),
  ('paint',                   'Paint',                     1260, true),
  ('passerale',               'Passerale',                 1270, true),
  ('plumbing',                'Plumbing',                  1280, true),
  ('polishing_pads',          'Polishing pads',            1290, true),
  ('repair_supplies',         'Repair supplies',           1300, true),
  ('rok_supplies',            'ROK supplies',              1310, true),
  ('sandpaper',               'Sandpaper',                 1320, true),
  ('scooter',                 'Scooter',                   1330, true),
  ('scuba',                   'Scuba',                     1340, true),
  ('security',                'Security',                  1350, true),
  ('sensors',                 'Sensors',                   1360, true),
  ('shaft',                   'Shaft',                     1370, true),
  ('sheets',                  'Sheets',                    1380, true),
  ('shower',                  'Shower',                    1390, true),
  ('solenoid',                'Solenoid',                  1400, true),
  ('spa',                     'Spa',                       1410, true),
  ('speakers',                'Speakers',                  1420, true),
  ('starlink',                'Starlink',                  1430, true),
  ('switches',                'Switches',                  1440, true),
  ('tanks',                   'Tanks',                     1450, true),
  ('toys',                    'Toys',                      1460, true),
  ('valves',                  'Valves',                    1470, true),
  ('wine',                    'Wine',                      1480, true),
  ('wiper',                   'Wiper',                     1490, true),
  ('yamaha',                  'Yamaha',                    1500, true),
  ('zincs',                   'Zincs',                     1510, true)
on conflict (code) do nothing;
