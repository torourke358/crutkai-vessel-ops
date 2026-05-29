// Sanity check after running 01_vessel_ops_schema.sql.
//
//   node scripts/probe-schema.mjs
//
// Confirms:
//   1. Every new table exists and is reachable by the service role.
//   2. Components seed data landed (10 rows).
//   3. notification_settings was backfilled for the existing 5 auth users.
//   4. inv_apply_quantity_change fires the crossing-detection alert.
//
// Read-only against everything except the test-row it inserts under a
// distinctive part_name so it can clean up after itself.

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

const tables = [
  "app_settings",
  "components",
  "inventory_items",
  "equipment",
  "equipment_hour_readings",
  "maintenance_tasks",
  "maintenance_history",
  "yard_periods",
  "yard_quadrants",
  "yard_tasks",
  "parts_consumed",
  "notifications",
  "notification_settings",
];

console.log("Table existence + row counts:");
for (const t of tables) {
  const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
  if (error) {
    console.log(`  ${t}: ERROR — ${error.message}`);
  } else {
    console.log(`  ${t}: ${count} row(s)`);
  }
}

console.log("\nComponents seed:");
const { data: comps } = await admin
  .from("components")
  .select("code, name, display_order")
  .order("display_order");
for (const c of comps ?? []) console.log(`  ${c.display_order.toString().padStart(3)} ${c.code} → ${c.name}`);

console.log("\nnotification_settings (one row per user):");
const { count: settingsCount } = await admin
  .from("notification_settings")
  .select("*", { count: "exact", head: true });
const { count: usersCount } = await admin
  .from("user_profiles")
  .select("*", { count: "exact", head: true });
console.log(`  ${settingsCount}/${usersCount} users have a settings row`);

console.log("\nCrossing-detection smoke test:");
// 1) Pick the first component so we have a valid FK.
const { data: firstComp } = await admin.from("components").select("id").limit(1).single();
// 2) Insert a marker inventory item right above its threshold.
const marker = `__probe_${Date.now()}`;
const { data: inserted, error: insErr } = await admin
  .from("inventory_items")
  .insert({
    part_name: marker,
    quantity: 5,
    critical_threshold: 4,
    related_component_id: firstComp?.id ?? null,
  })
  .select()
  .single();
if (insErr) {
  console.log(`  ! could not insert probe row: ${insErr.message}`);
  process.exit(1);
}
console.log(`  inserted probe row ${inserted.id} (qty=5, threshold=4, state=${inserted.alert_state})`);

// 3) Call inv_apply_quantity_change(-2) — should cross the threshold.
const { error: rpcErr } = await admin.rpc("inv_apply_quantity_change", {
  p_item_id: inserted.id,
  p_delta: -2,
  p_actor: null,
});
if (rpcErr) {
  console.log(`  ! inv_apply_quantity_change failed: ${rpcErr.message}`);
} else {
  const { data: after } = await admin
    .from("inventory_items")
    .select("quantity, alert_state")
    .eq("id", inserted.id)
    .single();
  console.log(`  after -2 delta: qty=${after.quantity}, state=${after.alert_state}`);

  const { count: alertCount } = await admin
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("related_type", "inventory_items")
    .eq("related_id", inserted.id);
  console.log(`  notifications enqueued for this probe: ${alertCount}`);
}

// 4) Clean up probe rows.
await admin.from("notifications").delete().eq("related_id", inserted.id);
await admin.from("inventory_items").delete().eq("id", inserted.id);
console.log("  cleaned up probe rows");

console.log("\nDone.");
