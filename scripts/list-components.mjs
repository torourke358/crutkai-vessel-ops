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

const { data, error } = await admin
  .from("components")
  .select("id, code, name, display_order, active, created_at")
  .order("display_order");

if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`${data?.length ?? 0} components in table:`);
console.table(
  (data ?? []).map((c) => ({
    order: c.display_order,
    name: c.name,
    code: c.code,
    active: c.active,
    created: c.created_at?.slice(0, 10),
  })),
);
