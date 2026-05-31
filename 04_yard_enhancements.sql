-- ============================================
-- Thor — Yard period enhancements: reminder date, resources, default
-- quadrants on period creation.
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Target: project ref trplphistdsfuecnnzdu (shared with crutkai-petty-cash)
-- Safe to re-run.
-- ============================================

-- 1) Task fields the detail panel needs.
alter table yard_tasks add column if not exists reminder_date date;
alter table yard_tasks add column if not exists resources text;

-- 2) Default-quadrant seeding for every new yard_period. Mimics Craig's
--    "Must Dos" software: Exterior / Interior / Engineering / Freeman,
--    each on one of the four soft Tailwind 200-level pastels.
create or replace function seed_default_quadrants() returns trigger as $$
begin
  insert into yard_quadrants (yard_period_id, name, color, display_order) values
    (new.id, 'Exterior',    '#bae6fd', 10),  -- sky
    (new.id, 'Interior',    '#bbf7d0', 20),  -- mint
    (new.id, 'Engineering', '#fed7aa', 30),  -- peach
    (new.id, 'Freeman',     '#ddd6fe', 40);  -- lavender
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists seed_default_quadrants_t on yard_periods;
create trigger seed_default_quadrants_t
  after insert on yard_periods
  for each row execute procedure seed_default_quadrants();
