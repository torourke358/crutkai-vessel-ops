// Specifically tests whether 02_vessel_ops_triggers.sql ran.
// That migration moved crossing detection into BEFORE/AFTER UPDATE triggers
// on inventory_items, so a DIRECT update (not via the RPC) should:
//   1. recompute alert_state automatically
//   2. fire enqueue_inventory_alert when above -> at_or_below
//
// If 02 hasn't run, alert_state stays 'above' and no notifications fire.

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

const { data: firstComp } = await admin.from("components").select("id").limit(1).single();
const marker = `__probe02_${Date.now()}`;
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
  console.error("insert failed:", insErr.message);
  process.exit(1);
}
console.log(`probe row ${inserted.id} created (qty=5, threshold=4, state=${inserted.alert_state})`);

// Direct UPDATE — bypasses inv_apply_quantity_change RPC. If 02 ran, the
// AFTER UPDATE trigger fires the alert.
const { error: updErr } = await admin
  .from("inventory_items")
  .update({ quantity: 3 })
  .eq("id", inserted.id);
if (updErr) {
  console.error("update failed:", updErr.message);
}

const { data: after } = await admin
  .from("inventory_items")
  .select("quantity, alert_state")
  .eq("id", inserted.id)
  .single();
console.log(`after direct UPDATE to qty=3: qty=${after.quantity}, state=${after.alert_state}`);

const { count: alertCount } = await admin
  .from("notifications")
  .select("*", { count: "exact", head: true })
  .eq("related_type", "inventory_items")
  .eq("related_id", inserted.id);
console.log(`notifications enqueued: ${alertCount}`);

const verdict =
  after.alert_state === "at_or_below" && (alertCount ?? 0) > 0
    ? "02_vessel_ops_triggers.sql IS APPLIED ✓"
    : "02_vessel_ops_triggers.sql is NOT applied — admin direct edits silently skip crossing detection";

console.log(`\nVerdict: ${verdict}`);

// Cleanup
await admin.from("notifications").delete().eq("related_id", inserted.id);
await admin.from("inventory_items").delete().eq("id", inserted.id);
console.log("cleaned up probe rows");
