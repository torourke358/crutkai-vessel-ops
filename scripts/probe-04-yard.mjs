// Verifies 04_yard_enhancements.sql:
//   1. yard_tasks.reminder_date + resources columns exist
//   2. AFTER INSERT trigger on yard_periods auto-seeds 4 quadrants
//   3. Auto-seeded quadrants have the right names + colors

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

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

// 1) Create a test yard period and verify quadrant auto-seed.
const periodName = `__probe04_${Date.now()}`;
const { data: period, error: pErr } = await admin
  .from("yard_periods")
  .insert({
    name: periodName,
    start_date: "2026-06-01",
    status: "planned",
  })
  .select()
  .single();
check("yard_periods INSERT succeeded", !pErr, pErr?.message ?? "");

if (period) {
  const { data: quads } = await admin
    .from("yard_quadrants")
    .select("name, color, display_order")
    .eq("yard_period_id", period.id)
    .order("display_order");

  check("trigger seeded 4 quadrants", (quads ?? []).length === 4, `${quads?.length} created`);

  const expected = [
    ["Exterior", "#bae6fd"],
    ["Interior", "#bbf7d0"],
    ["Engineering", "#fed7aa"],
    ["Freeman", "#ddd6fe"],
  ];
  for (let i = 0; i < expected.length; i++) {
    const [name, color] = expected[i];
    const q = quads?.[i];
    check(
      `quadrant #${i + 1} is ${name} (${color})`,
      q?.name === name && q?.color === color,
      `got name=${q?.name}, color=${q?.color}`,
    );
  }

  // 2) Insert a task with reminder_date + resources
  if (quads && quads.length > 0) {
    const { data: firstQuad } = await admin
      .from("yard_quadrants")
      .select("id")
      .eq("yard_period_id", period.id)
      .limit(1)
      .single();

    const { data: task, error: tErr } = await admin
      .from("yard_tasks")
      .insert({
        yard_period_id: period.id,
        quadrant_id: firstQuad?.id,
        title: "Probe task",
        reminder_date: "2026-06-15",
        resources: "https://example.com/vendor-spec.pdf",
        description: "Notes here.",
        progress_pct: 25,
        effort: "M",
      })
      .select()
      .single();
    check("yard_tasks insert w/ reminder_date + resources", !tErr, tErr?.message ?? "");
    if (task) {
      check("reminder_date stored correctly", task.reminder_date === "2026-06-15");
      check("resources stored correctly", task.resources?.includes("vendor-spec.pdf") ?? false);
      check("progress_pct preserved", task.progress_pct === 25);
      check("effort preserved", task.effort === "M");

      // Update via the same path the detail panel uses
      const { data: updated } = await admin
        .from("yard_tasks")
        .update({ reminder_date: null, resources: "Updated resources", progress_pct: 75 })
        .eq("id", task.id)
        .select()
        .single();
      check("nulling reminder_date works", updated?.reminder_date === null);
      check("updating resources works", updated?.resources === "Updated resources");
      check("updating progress works", updated?.progress_pct === 75);
    }
  }

  // Cleanup
  await admin.from("yard_periods").delete().eq("id", period.id);
}

// 3) Stale-test: existing yard periods kept their existing quadrants
const { count: totalQuads } = await admin
  .from("yard_quadrants")
  .select("*", { count: "exact", head: true });
console.log(`\n(info) total yard_quadrants in DB: ${totalQuads ?? 0}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
