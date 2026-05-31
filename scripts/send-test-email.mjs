// Send a one-off test email through the Thor notifications + Resend pipeline.
// Usage:
//   node scripts/send-test-email.mjs <recipient_user_id> <recipient_email> "<subject>" "<body>"
//
// Example:
//   node scripts/send-test-email.mjs fb1ecc78-05b3-4d34-8220-4562b256f7bb \
//     crutkai@mac.com "Thor Inventory Alert Is Live" "Body text..."

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const [, , userId, email, subject, body] = process.argv;
if (!userId || !email || !subject || !body) {
  console.error(
    "usage: node scripts/send-test-email.mjs <user_id> <email> <subject> <body>",
  );
  process.exit(1);
}

const admin = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\s/g, ""),
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\s/g, ""),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const CRON_SECRET = (process.env.CRON_SECRET ?? "").replace(/\s/g, "");
const SITE = "https://crutkai-vessel-ops.vercel.app";

const { data: inserted, error: insErr } = await admin
  .from("notifications")
  .insert({
    kind: "inventory_critical",
    channel: "email",
    recipient_id: userId,
    recipient_email: email,
    subject,
    body,
    related_type: "smoke_test",
    status: "pending",
  })
  .select("id")
  .single();
if (insErr) {
  console.error("insert failed:", insErr.message);
  process.exit(1);
}
console.log(`queued ${inserted.id} → ${email}`);

const res = await fetch(`${SITE}/api/cron/send-outbox`, {
  method: "GET",
  headers: { Authorization: `Bearer ${CRON_SECRET}` },
});
console.log(`cron: ${res.status} ${await res.text()}`);

const { data: after } = await admin
  .from("notifications")
  .select("status, error, sent_at")
  .eq("id", inserted.id)
  .single();
console.log("row after:", after);
