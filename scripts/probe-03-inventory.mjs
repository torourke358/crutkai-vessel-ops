// Verifies 03_inventory_enhancements.sql:
//   1. component_ids column exists, accepts arrays, rejects > 8
//   2. location_photo_path column exists
//   3. related_component_id is GONE
//   4. inventory-photos storage bucket exists
//   5. Crossing detection still works against the new column shape

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

// 1) component_ids column exists & default is empty array
const { data: comps } = await admin.from("components").select("id").limit(3);
const compIds = (comps ?? []).map((c) => c.id);

const { data: inserted, error: insErr } = await admin
  .from("inventory_items")
  .insert({
    part_name: `__probe03_${Date.now()}`,
    quantity: 1,
    component_ids: compIds.slice(0, 2),
  })
  .select()
  .single();

check("component_ids accepts a uuid[] on insert", !insErr, insErr?.message ?? "");
if (inserted) {
  check(
    "stored component_ids matches input length",
    inserted.component_ids?.length === compIds.slice(0, 2).length,
    `stored ${inserted.component_ids?.length}`,
  );
  check("location_photo_path column exists & null by default", inserted.location_photo_path === null);
  check(
    "related_component_id is GONE",
    !("related_component_id" in inserted),
    "related_component_id" in inserted ? "still present" : "gone",
  );
}

// 2) Check constraint rejects > 8 components
const tooMany = Array.from({ length: 9 }, () => compIds[0] ?? "00000000-0000-0000-0000-000000000000");
const { error: capErr } = await admin
  .from("inventory_items")
  .insert({
    part_name: `__probe03_cap_${Date.now()}`,
    quantity: 1,
    component_ids: tooMany,
  });
check(
  "CHECK constraint rejects > 8 components",
  capErr != null && /inventory_items_component_count/.test(capErr.message ?? ""),
  capErr?.message?.slice(0, 80) ?? "no error raised",
);

// 3) inventory-photos storage bucket exists
const { data: buckets } = await admin.storage.listBuckets();
const hasBucket = (buckets ?? []).some((b) => b.id === "inventory-photos");
check("inventory-photos storage bucket exists", hasBucket);

// 4) Update component_ids — confirms array updates work
if (inserted) {
  const { data: updated, error: updErr } = await admin
    .from("inventory_items")
    .update({ component_ids: compIds.slice(0, 3) })
    .eq("id", inserted.id)
    .select()
    .single();
  check(
    "component_ids array can be updated",
    !updErr && updated?.component_ids?.length === Math.min(3, compIds.length),
    updErr?.message ?? `now ${updated?.component_ids?.length}`,
  );
}

// 5) Crossing detection still fires on direct quantity update (regression test)
if (inserted) {
  const { error: thrErr } = await admin
    .from("inventory_items")
    .update({ critical_threshold: 5, quantity: 6 })
    .eq("id", inserted.id);
  check("threshold + qty update succeeds", !thrErr, thrErr?.message ?? "");

  const { error: dropErr } = await admin
    .from("inventory_items")
    .update({ quantity: 4 })
    .eq("id", inserted.id);
  check("quantity drop succeeds", !dropErr, dropErr?.message ?? "");

  const { data: after } = await admin
    .from("inventory_items")
    .select("quantity, alert_state")
    .eq("id", inserted.id)
    .single();
  check(
    "alert_state crossed to at_or_below",
    after?.alert_state === "at_or_below",
    `state=${after?.alert_state}`,
  );

  const { count: alerts } = await admin
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("related_id", inserted.id);
  check(
    "crossing-detection trigger queued at least one alert",
    (alerts ?? 0) > 0,
    `${alerts} alert(s) enqueued`,
  );
}

// Cleanup probe rows + their notifications.
if (inserted) {
  await admin.from("notifications").delete().eq("related_id", inserted.id);
  await admin.from("inventory_items").delete().eq("id", inserted.id);
}
await admin
  .from("inventory_items")
  .delete()
  .like("part_name", "__probe03_%");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
