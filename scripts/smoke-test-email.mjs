// End-to-end smoke test for the Resend domain swap.
//   1. Flip vessel_email_from / vessel_email_from_name in app_settings
//      (idempotent — does nothing if values already match).
//   2. Insert one pending email notification to Tim's inbox.
//   3. Call /api/cron/send-outbox with the CRON_SECRET so Resend actually
//      ships it (instead of waiting for the next minute-tick).
//   4. Read back the notification row to confirm status=sent.

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

const CRON_SECRET = (process.env.CRON_SECRET ?? "").replace(/\s/g, "");
const SITE = "https://crutkai-vessel-ops.vercel.app";
const TIM_USER_ID = "9f7596b7-7861-4cb8-a93b-eebba74bd7f4";
const TIM_EMAIL = "torourke358@hotmail.com";

// 1) Flip app_settings to the verified domain.
const SETTINGS = [
  ["vessel_email_from", "thor@smartaiforaccountants.com"],
  ["vessel_email_from_name", "Thor · M/Y Anne-Marie"],
];
for (const [key, value] of SETTINGS) {
  const { error } = await admin
    .from("app_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) {
    console.error(`failed to upsert ${key}:`, error.message);
    process.exit(1);
  }
}
console.log("✓ app_settings: From = thor@smartaiforaccountants.com");

// 2) Insert a pending email notification.
const { data: inserted, error: insErr } = await admin
  .from("notifications")
  .insert({
    kind: "inventory_critical",
    channel: "email",
    recipient_id: TIM_USER_ID,
    recipient_email: TIM_EMAIL,
    subject: "Thor smoke test — Resend domain is live",
    body: `If you're reading this in your inbox (or junk), the Resend domain swap worked.\n\nDelivery path:\n  Supabase notifications row → Vercel cron → Resend → ${TIM_EMAIL}\n\nNo action required — this is a one-shot test from the smoke script.`,
    related_type: "smoke_test",
    status: "pending",
  })
  .select("id")
  .single();
if (insErr) {
  console.error("notification insert failed:", insErr.message);
  process.exit(1);
}
const notifId = inserted.id;
console.log(`✓ queued notification ${notifId} (pending, email channel)`);

// 3) Trigger the send-outbox cron right now.
const res = await fetch(`${SITE}/api/cron/send-outbox`, {
  method: "GET",
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
});
const cronBody = await res.text();
console.log(`✓ cron response: ${res.status} ${cronBody}`);

// 4) Read the notification row back to see the final status.
const { data: after } = await admin
  .from("notifications")
  .select("status, error, sent_at")
  .eq("id", notifId)
  .single();
console.log(`✓ notification row after send:`, after);

if (after?.status === "sent") {
  console.log("\nResult: success. Check Tim's inbox at torourke358@hotmail.com.");
  console.log("        (If not there, check the spam folder.)");
} else {
  console.log("\nResult: FAILED. error:", after?.error);
}
