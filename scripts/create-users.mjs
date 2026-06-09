// One-shot crew/admin provisioning. Reads service-role creds from .env.local
// and creates auth.users + matching user_profiles rows. Idempotent: re-running
// updates the profile (e.g. role) but won't duplicate accounts.
//
// Note: petty cash and Vessel Ops share the same Supabase project, so the
// users below already exist as of 2026-05-28. Re-running this script will
// reset their passwords back to `pettycash2026` — only do that intentionally.
//
// Run:  node scripts/create-users.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\s/g, "");
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\s/g, "");

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const users = [
  {
    email: "crutkai@mac.com",
    password: "pettycash2026",
    full_name: "Craig Rutkai",
    role: "admin",
  },
  {
    email: "krutkai@mac.com",
    password: "pettycash2026",
    full_name: "Kim Rutkai",
    role: "admin",
  },
  {
    email: "Kc130greenberg@hotmail.com",
    password: "pettycash2026",
    full_name: "Brent Greenberg",
    role: "crew",
  },
  {
    email: "ivanvillaceram88@gmail.com",
    password: "pettycash2026",
    full_name: "Ivan Villaceram",
    role: "crew",
  },
];

async function findByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
}

for (const u of users) {
  console.log(`\n${u.email} (${u.full_name}, ${u.role})`);

  let userId;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { full_name: u.full_name },
  });

  if (createErr) {
    if (/already/i.test(createErr.message)) {
      const existing = await findByEmail(u.email);
      if (!existing) {
        console.error(`  ! createUser said exists, but listUsers couldn't find them. Skipping.`);
        continue;
      }
      userId = existing.id;
      console.log(`  - account exists; leaving auth row alone, refreshing profile only`);
    } else {
      console.error(`  ! createUser failed:`, createErr.message);
      continue;
    }
  } else {
    userId = created.user.id;
    console.log(`  - created auth user`);
  }

  const { error: profErr } = await admin
    .from("user_profiles")
    .upsert({ id: userId, full_name: u.full_name, role: u.role }, { onConflict: "id" });

  if (profErr) {
    console.error(`  ! user_profiles upsert failed:`, profErr.message);
  } else {
    console.log(`  - user_profiles ok (role=${u.role})`);
  }
}

console.log("\nDone.");
