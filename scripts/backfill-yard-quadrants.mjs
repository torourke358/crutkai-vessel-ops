// Backfills the 4 default quadrants (Exterior / Interior / Engineering /
// Freeman) into any existing yard_period that has zero quadrants.
//
// Why: 04_yard_enhancements.sql adds an AFTER INSERT trigger, but that
// only fires on new yard_periods. Periods created before the migration
// stay empty. This script catches them up. Idempotent — skips periods
// that already have any quadrant rows.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const admin = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\s/g, ""),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\s/g, ""),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const DEFAULTS = [
  { name: "Exterior",    color: "#bae6fd", display_order: 10 },
  { name: "Interior",    color: "#bbf7d0", display_order: 20 },
  { name: "Engineering", color: "#fed7aa", display_order: 30 },
  { name: "Freeman",     color: "#ddd6fe", display_order: 40 },
];

const { data: periods, error } = await admin
  .from("yard_periods")
  .select("id, name");
if (error) {
  console.error("failed to list periods:", error.message);
  process.exit(1);
}

console.log(`found ${periods?.length ?? 0} yard period(s)`);

let backfilled = 0;
for (const p of periods ?? []) {
  const { count } = await admin
    .from("yard_quadrants")
    .select("*", { count: "exact", head: true })
    .eq("yard_period_id", p.id);

  if ((count ?? 0) > 0) {
    console.log(`  · ${p.name}: ${count} quadrant(s) already — skip`);
    continue;
  }

  const { error: insErr } = await admin.from("yard_quadrants").insert(
    DEFAULTS.map((d) => ({ ...d, yard_period_id: p.id })),
  );
  if (insErr) {
    console.log(`  ! ${p.name}: insert failed — ${insErr.message}`);
    continue;
  }
  console.log(`  ✓ ${p.name}: seeded 4 default quadrants`);
  backfilled++;
}

console.log(`\nDone. Backfilled ${backfilled} period(s).`);
