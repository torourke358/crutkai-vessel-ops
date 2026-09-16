-- ============================================
-- Runa — Guest toys, galley kit, and where a refit purchase lands
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu
-- Safe to re-run.
--
-- TOYS. Craig's "toys scuba, scooters, ect" means the kit guests use on
-- holiday. The thing that matters about it is not where it is stored — it is
-- already in inventory under his own Toys / Scuba / Scooter categories — but
-- that it goes OUT OF TEST. A scuba cylinder needs a visual inspection every
-- year and a hydrostatic test every five; a scooter needs its battery
-- serviced. Handing a guest a cylinder that is out of test is the failure this
-- prevents.
--
-- So toys are not a new kind of thing: they are EQUIPMENT. The equipment
-- register already carries PM schedules, service history, photos, manuals and
-- a cost, and the maintenance cron already emails when something is due. All
-- this migration does is let the register say which entries are guest kit, so
-- they can be listed on their own.
--
-- F&B. Tim, 15 Sep: a new wine fridge bought AS PART OF A REFIT is capital and
-- belongs in yard money; the same fridge replaced mid-season is operating cost
-- and stays in petty cash, where F&B is already a department. Two columns
-- record the first case — which yard period the kit was bought in, and which
-- invoice paid for it — so a piece of galley kit can be traced back to the
-- refit that bought it. Nothing here touches petty cash.
--
-- Adds: equipment.kind, equipment.acquired_yard_period_id,
-- equipment.acquired_invoice_id.
-- ============================================

alter table equipment
  add column if not exists kind text not null default 'vessel',
  add column if not exists acquired_yard_period_id uuid
    references yard_periods(id) on delete set null,
  add column if not exists acquired_invoice_id uuid
    references yard_invoices(id) on delete set null;

-- 'vessel'    — the boat's own machinery: engines, gensets, gearboxes.
-- 'guest_toy' — kit guests use: scuba cylinders, regulators, scooters, seabobs.
-- 'galley'    — F&B kit: wine fridge, ice maker, coffee machine.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'equipment_kind_check' and conrelid = 'equipment'::regclass
  ) then
    alter table equipment add constraint equipment_kind_check
      check (kind in ('vessel', 'guest_toy', 'galley'));
  end if;
end $$;

-- Every existing row is the boat's own machinery; the default already says so,
-- but be explicit for any row that predates the default.
update equipment set kind = 'vessel' where kind is null;

create index if not exists idx_equipment_kind on equipment (kind, name);
create index if not exists idx_equipment_acquired_period
  on equipment (acquired_yard_period_id)
  where acquired_yard_period_id is not null;
