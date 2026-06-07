# Thor — Round 1 (Craig) feedback: change log

Branch: `round1-craig-feedback` (off `main`). Build + lint clean (`npm run build`,
`eslint`). One SQL migration ships with this branch and must be run by hand in
Supabase — see **Database migration** below.

This file is the client-explanation + audit source for the round-1 pass. It lists
what changed per item, every assumption/default I picked while running unattended,
what was hidden vs. dropped, and the data that needs your eyes (location backfill).

---

## 1. Daily to-do as the landing page  ✅

- The post-login landing (`/`, `HomePage`) now **leads with today's actionable
  maintenance** — the same three-section dashboard as `/maintenance` (Time-based
  due / Hours-based due / Overdue) — followed by the vessel banner and the existing
  Inventory / Maintenance / All-clear / Yard / Equipment / Alerts summary cards.
- **No parallel query path.** The `/maintenance` dashboard's load+enrich logic was
  factored into `loadMaintenanceDashboardTasks(supabase, asOf)` in
  `src/lib/maintenance.ts`. Both `/` and `/maintenance` call it, so they can never
  drift. The home page also derives its "Due today / Overdue / Maintenance OK"
  summary counts from the same loaded list (the old separate count query on the
  home page was removed).
- Added a **"Daily"** tab at the front of the header nav (`NavLinks.tsx`) pointing
  at `/`. It highlights only on the exact `/` route.

## 2. Inventory

No change (signed off).

## 3. Equipment — consolidate location, drop Zone, drop ISM/ISPS  ✅

### a. Location → single dropdown fed by `vessel_zones`
- "Location on vessel" is now a **dropdown** whose options are the active
  `vessel_zones` rows by `name`, ordered by `display_order` (no new table —
  reuses `vessel_zones`).
- **Storage is unchanged:** the selected value is written to the existing
  `equipment.location_on_vessel` text column as the chosen name string. Every
  existing reader keeps working (equipment list, equipment hours-log page, detail
  view) — none were switched to a join.
- **Legacy/custom strings are preserved.** If a unit's current
  `location_on_vessel` isn't one of the managed zone names, it's still shown in the
  dropdown as "`<value>` (custom)" and selected, so editing a unit never silently
  drops its location.

### b. Removed the separate "Zone" field
- Removed the Zone `<select>` from the form, `zone_id` from the form
  values/`emptyEquipmentForm`/`equipmentValuesToBody`, and from the equipment POST
  and PATCH API schemas/writes. The `vessel_zones` **table is kept** (it now feeds
  the Location dropdown), and the `vessel_zones` fetches on the new/detail equipment
  pages are kept for that purpose.
- **Equipment list "By zone" grid → "By location".** The equipment list page
  (`equipment/page.tsx`) was grouping the cards by `zone_id` — a load-bearing reader
  of the column. Rather than break that feature (ground rule 3) I **repointed it to
  group by `location_on_vessel`** (managed locations first, ordered by
  `vessel_zones.display_order`; then any custom strings alphabetically; then an
  "Unassigned" bucket). This keeps the grouped view Craig liked *and* removes the
  last reader of `zone_id`, so the column can be dropped.

### c. Removed ISM and ISPS (kept `critical`)
- Removed the ISM/ISPS checkboxes from the form, the ISM/ISPS badges on the
  equipment list and detail pages, the form values, the API schemas, and the
  `Equipment` type fields. **`critical` is untouched** (checkbox, badges, filters).

### GA pin picker
Untouched — `GaPinPicker`, `equipment.ga_x`/`ga_y`, and the GA schematic on the
equipment list all still work exactly as before.

## 4. Maintenance — type-in equipment (match-or-create)  ✅

- The equipment `<select>` in `MaintenanceTaskForm` is now a **single-select
  type-ahead** modeled on `ComponentMultiSelect`: search active equipment by name,
  or type a name with no match and choose **"+ Add '<name>' as new equipment."**
- "Add as new" **POSTs a minimal equipment record (name only)** to the existing
  `POST /api/equipment` and links the returned `id`. This keeps
  `maintenance_tasks.equipment_id` as a real NOT-NULL FK, so
  `complete_maintenance_task()` still bumps `current_hours` + the hour-readings log
  and hours-based due math/sign-off keep working. **No schema change.**
- **Behavior to note:** typing a new name here **creates a real equipment row**
  (name only, all other fields blank). It will appear in the Equipment module for
  later enrichment. This is intentional and audited (the create goes through the
  normal equipment POST → `audit_log`).

## 5. Maintenance — due-type input UI  ✅

- The due-type select + conditional interval inputs are replaced by one
  **"Repeat every [number] [Days ▾ / Hours ▾]"** control. Days writes
  `interval_days` and sets `due_type='calendar'`; Hours writes `interval_hours` and
  sets `due_type='hours'`. The typed number carries across a unit toggle and the
  now-unused interval field is cleared, so the `due_fields_match_type` constraint is
  always satisfied. Underlying model unchanged.
- The last-done date stays a native **`<input type="date">`** (it already was), so
  iOS Safari/PWA shows the native calendar — matching `commissioned_date`.

## 6. Yard

No change (looks great to go).

## 7. Reports — cost pie + Numbers-friendly export  ✅

- Added a **"Yard cost by quadrant"** section to the reports page: a pie rendered
  with a CSS `conic-gradient` (**no charting dependency** added) plus a colored
  legend with per-quadrant amounts, percentages, and a total. Each slice uses the
  quadrant's own `color`. Scoped to the **same date range** as the existing yard
  throughput report (completed-task `actual_cost` in the selected From/To range).
- Added a **CSV export** at `GET /api/reports/yard/export?...&format=csv`
  (UTF-8 BOM, same columns as the xlsx) for Apple Numbers. The **xlsx path is
  unchanged**; a "CSV" link sits next to the existing "Excel" link.

## 8. Systems tab

No change (do-not-touch).

---

## Database migration — ACTION REQUIRED

`13_round1_craig_feedback.sql` (repo root). **Run order: deploy this branch's app
code first** (it no longer reads/writes `zone_id`, `is_ism`, `is_isps`), **then run
the SQL** in Supabase → SQL Editor. Safe to re-run.

- **Section 1 (backfill, critical):** for every equipment row where
  `location_on_vessel` is null/blank **and** `zone_id` is set, copy that zone's
  `name` into `location_on_vessel`. Only fills blanks — never overwrites a typed
  value. Each backfilled row is written to `audit_log` (`action='update'`, actor =
  an active admin) so the migration is auditable like every other mutation.
- **Section 2 (cleanup, recommended):** drops `equipment.zone_id`, `is_ism`,
  `is_isps` and their indexes. Nothing in the app reads them anymore (grepped before
  dropping). If you'd rather keep the columns as dormant data for now, you can skip
  Section 2 — the app behaves identically either way.

### Hid vs. dropped
- **Dropped** (via the migration, once code is deployed): `equipment.zone_id`,
  `equipment.is_ism`, `equipment.is_isps` + their indexes — because after this
  branch nothing reads them.
- **Kept** (load-bearing, deliberately not removed): the `vessel_zones` table
  (now feeds the Location dropdown), `equipment.location_on_vessel` (now the single
  location column), `equipment.critical`, and all GA pin data.

---

## Assumptions / defaults picked while running unattended

1. **`reports/yard/page.tsx` doesn't exist.** Reports is a single combined
   `src/app/(app)/reports/page.tsx`, and there was no pre-existing yard *cost*
   report (only "Yard task throughput"). **Default:** I added the cost pie + CSV to
   that combined reports page, scoped to the same From/To date range the throughput
   report/export already use, since `actual_cost` is realized at task completion.
2. **No `/admin/zones` management page exists.** Item 3a asked to relabel it
   "Locations." There's no zones-admin UI in the app (the seed comment in
   `12_vessel_zones.sql` references one that was never built), so there was nothing
   to relabel. **The location list is currently governed directly by the
   `vessel_zones` table** (edit/seed via SQL). If you want a "Locations" admin
   screen, that's a small new build — say the word. *(Not built: the do-not-touch
   list forbids new modules.)*
3. **Cost pie grouping = by quadrant *name*, not quadrant id.** Quadrants are
   per-yard-period, so the same category (e.g. "Fires") exists separately in each
   period. To produce one clean category pie I aggregate cost by quadrant **name**
   across periods and use the first color seen for that name (template colors are
   consistent across periods). Tasks whose quadrant can't be resolved fall under
   "Unassigned" (slate). Only costs `> 0` are charted.
4. **Type-ahead "Add as new equipment" creates a name-only row** (see item 4). It
   does not call `router.refresh()` mid-edit (to avoid disturbing the in-progress
   form); the new unit is added to the local list and selected immediately, and is
   picked up server-side on the next navigation.
5. **Inactive equipment on an existing task:** the maintenance editor is fed only
   *active* equipment. If you edit a task whose equipment is inactive, the
   type-ahead shows "Selected equipment" (the id is preserved and saved correctly)
   rather than the name, since the name isn't in the active list. Minor display-only
   edge case.

---

## Unmatched data needing your attention (location migration)

After you run `13_round1_craig_feedback.sql`, review equipment whose
`location_on_vessel` is **not** one of the managed `vessel_zones` names — these are
legacy free-text values left untouched (never discarded). They'll show up in the UI
under their own card in the equipment "By location" grid and as "`<value>` (custom)"
in the edit dropdown. To fold them into the managed list, either rename them to a
zone name on each unit, or add the value to `vessel_zones`.

Quick query to find them (run after the migration):

```sql
select e.id, e.name, e.location_on_vessel
from equipment e
where coalesce(btrim(e.location_on_vessel), '') <> ''
  and lower(btrim(e.location_on_vessel)) not in (
    select lower(name) from vessel_zones
  )
order by e.location_on_vessel, e.name;
```

Also worth a glance — units where Zone and a typed Location disagreed: the backfill
**only** filled blanks, so any unit that already had a typed `location_on_vessel`
kept it (its old `zone_id`, if different, was not applied and is now dropped). If a
unit's location looks wrong, that's where to look.
