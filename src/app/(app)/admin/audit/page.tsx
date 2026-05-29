import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatDate, monthStartLocal, todayLocal } from "@/lib/format";

export const dynamic = "force-dynamic";

interface AuditRow {
  id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  created_at: string;
}

const ENTITY_TYPES = [
  "all",
  "inventory_item",
  "equipment",
  "equipment_hour_reading",
  "maintenance_task",
  "maintenance_history",
  "yard_period",
  "yard_quadrant",
  "yard_task",
  "parts_consumed",
  "notification_settings",
] as const;

const inputClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; entity?: string; user?: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/");

  const sp = await searchParams;
  const from = sp.from || monthStartLocal();
  const to = sp.to || todayLocal();
  const entity = sp.entity || "all";
  const userFilter = sp.user || "";

  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("id, user_id, entity_type, entity_id, action, created_at")
    .gte("created_at", `${from}T00:00:00`)
    .lte("created_at", `${to}T23:59:59`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (entity !== "all") query = query.eq("entity_type", entity);
  if (userFilter) query = query.eq("user_id", userFilter);

  const { data: rows } = await query.returns<AuditRow[]>();

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean) as string[])];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name");
  const { data: allProfiles } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const nameById = new Map(
    [...(profiles ?? []), ...(allProfiles ?? [])].map((p) => [p.id, p.full_name] as const),
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Audit log</h1>
        <Link href="/" className="text-sm text-slate-500">
          Home
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-500">From</label>
          <input type="date" name="from" defaultValue={from} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">To</label>
          <input type="date" name="to" defaultValue={to} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Entity</label>
          <select name="entity" defaultValue={entity} className={inputClass}>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">User</label>
          <select name="user" defaultValue={userFilter} className={inputClass}>
            <option value="">All users</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.id}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Apply
        </button>
      </form>

      <p className="text-sm text-slate-500">{(rows ?? []).length} entries shown (newest first, capped at 500)</p>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {(rows ?? []).length === 0 ? (
          <li className="p-4 text-center text-sm text-slate-400">No entries in this range.</li>
        ) : (
          (rows ?? []).map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <span className="font-medium capitalize text-slate-900">{r.action}</span>{" "}
                  <span className="text-slate-500">{r.entity_type}</span>{" "}
                  {r.entity_id && (
                    <span className="text-xs font-mono text-slate-400">
                      {r.entity_id.slice(0, 8)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  {(r.user_id && nameById.get(r.user_id)) || "Unknown"} ·{" "}
                  {formatDate(r.created_at.slice(0, 10))}{" "}
                  {r.created_at.slice(11, 16)}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
