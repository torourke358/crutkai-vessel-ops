import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayLocal } from "@/lib/format";
import ReportsDateRange from "@/components/ReportsDateRange";

export const dynamic = "force-dynamic";

// Subtract N days from a YYYY-MM-DD ISO string, anchored at local noon so
// daylight-saving boundaries don't drift the date by one.
function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

interface YardRow {
  id: string;
  title: string;
  effort: "S" | "M" | "L" | null;
  completed_at: string | null;
  completed_by: string | null;
}

interface MaintenanceRow {
  id: string;
  task_id: string;
  completed_at: string;
  completed_by: string | null;
  hours_at_completion: number | null;
  maintenance_task: { title: string; equipment: { name: string } | null } | null;
}

interface PartsConsumedRow {
  id: string;
  qty_used: number;
  recorded_at: string;
  recorded_by: string | null;
  source_type: "maintenance" | "yard";
  inventory_item: { part_name: string; unit: string } | null;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  const today = todayLocal();
  const raw = await searchParams;
  const to = raw.to ?? today;
  const from = raw.from ?? shiftDays(to, -30);

  // ISO ranges are inclusive on the from side; for the to side we extend to
  // 23:59:59 of that day so anything completed that afternoon still counts.
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const [
    { data: yardRows },
    { data: maintRows },
    { data: partsRows },
    { data: users },
  ] = await Promise.all([
    supabase
      .from("yard_tasks")
      .select("id, title, effort, completed_at, completed_by")
      .gte("completed_at", fromIso)
      .lte("completed_at", toIso)
      .order("completed_at", { ascending: false })
      .returns<YardRow[]>(),
    supabase
      .from("maintenance_history")
      .select(
        "id, task_id, completed_at, completed_by, hours_at_completion, maintenance_task:maintenance_tasks(title, equipment:equipment(name))",
      )
      .gte("completed_at", fromIso)
      .lte("completed_at", toIso)
      .order("completed_at", { ascending: false })
      .returns<MaintenanceRow[]>(),
    supabase
      .from("parts_consumed")
      .select(
        "id, qty_used, recorded_at, recorded_by, source_type, inventory_item:inventory_items(part_name, unit)",
      )
      .gte("recorded_at", fromIso)
      .lte("recorded_at", toIso)
      .order("recorded_at", { ascending: false })
      .returns<PartsConsumedRow[]>(),
    supabase.from("user_profiles").select("id, full_name"),
  ]);

  const nameById = new Map(
    (users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const),
  );

  // Aggregate: yard tasks per crew member.
  const yardBy = new Map<string, { name: string; count: number; s: number; m: number; l: number }>();
  for (const r of yardRows ?? []) {
    const key = r.completed_by ?? "unassigned";
    const name = r.completed_by
      ? nameById.get(r.completed_by) ?? "Unknown"
      : "Unassigned";
    const cur = yardBy.get(key) ?? { name, count: 0, s: 0, m: 0, l: 0 };
    cur.count++;
    if (r.effort === "S") cur.s++;
    if (r.effort === "M") cur.m++;
    if (r.effort === "L") cur.l++;
    yardBy.set(key, cur);
  }
  const yardSummary = [...yardBy.values()].sort((a, b) => b.count - a.count);

  // Aggregate: maintenance completions per crew member.
  const maintBy = new Map<string, { name: string; count: number }>();
  for (const r of maintRows ?? []) {
    const key = r.completed_by ?? "unassigned";
    const name = r.completed_by
      ? nameById.get(r.completed_by) ?? "Unknown"
      : "Unassigned";
    const cur = maintBy.get(key) ?? { name, count: 0 };
    cur.count++;
    maintBy.set(key, cur);
  }
  const maintSummary = [...maintBy.values()].sort((a, b) => b.count - a.count);

  // Aggregate: inventory churn — total qty pulled per part.
  const partsBy = new Map<string, { name: string; unit: string; qty: number }>();
  for (const r of partsRows ?? []) {
    const name = r.inventory_item?.part_name ?? "(deleted item)";
    const unit = r.inventory_item?.unit ?? "Units";
    const cur = partsBy.get(name) ?? { name, unit, qty: 0 };
    cur.qty += r.qty_used;
    partsBy.set(name, cur);
  }
  const partsSummary = [...partsBy.values()].sort((a, b) => b.qty - a.qty);

  const qs = `?from=${from}&to=${to}`;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Reports</h1>
        <ReportsDateRange initialFrom={from} initialTo={to} />
      </div>
      <p className="text-sm text-slate-500">
        Activity between <strong>{formatDate(from)}</strong> and{" "}
        <strong>{formatDate(to)}</strong>.
      </p>

      {/* Yard throughput */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Yard task throughput
          </h2>
          <a
            href={`/api/reports/yard/export${qs}`}
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Excel
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {yardSummary.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">
              No yard tasks completed in this range.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Crew member</th>
                  <th className="px-3 py-2 text-right">Completed</th>
                  <th className="px-3 py-2 text-right">S</th>
                  <th className="px-3 py-2 text-right">M</th>
                  <th className="px-3 py-2 text-right">L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yardSummary.map((r) => (
                  <tr key={r.name}>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.s}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.m}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Maintenance completions */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Maintenance completions
          </h2>
          <a
            href={`/api/reports/maintenance/export${qs}`}
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Excel
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {maintSummary.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">
              No maintenance sign-offs in this range.
            </p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Crew member</th>
                    <th className="px-3 py-2 text-right">Sign-offs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {maintSummary.map((r) => (
                    <tr key={r.name}>
                      <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-3 py-2 text-slate-900">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                      {(maintRows ?? []).length}
                    </td>
                  </tr>
                </tbody>
              </table>
              <details className="border-t border-slate-100">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-500 hover:text-violet-700">
                  Show individual sign-offs ({(maintRows ?? []).length})
                </summary>
                <ul className="divide-y divide-slate-100">
                  {(maintRows ?? []).slice(0, 50).map((r) => (
                    <li key={r.id} className="grid grid-cols-12 gap-2 p-3 text-xs">
                      <span className="col-span-3 text-slate-500">
                        {formatDate(r.completed_at.slice(0, 10))}
                      </span>
                      <span className="col-span-3 text-slate-700">
                        {r.completed_by ? nameById.get(r.completed_by) ?? "Unknown" : "—"}
                      </span>
                      <span className="col-span-4 truncate text-slate-900">
                        {r.maintenance_task?.title ?? "(deleted)"}
                      </span>
                      <span className="col-span-2 truncate text-slate-400">
                        {r.maintenance_task?.equipment?.name ?? "—"}
                      </span>
                    </li>
                  ))}
                  {(maintRows ?? []).length > 50 && (
                    <li className="p-3 text-center text-xs text-slate-400">
                      Showing first 50. Export Excel for the full set.
                    </li>
                  )}
                </ul>
              </details>
            </>
          )}
        </div>
      </section>

      {/* Inventory churn */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Inventory churn</h2>
          <a
            href={`/api/reports/inventory/export${qs}`}
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Excel
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {partsSummary.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">
              No parts consumed in this range.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Part</th>
                  <th className="px-3 py-2 text-right">Qty used</th>
                  <th className="px-3 py-2 text-left">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partsSummary.map((r) => (
                  <tr key={r.name}>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                    <td className="px-3 py-2 text-slate-500">{r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="text-xs text-slate-400">
        <Link href="/" className="hover:text-violet-700">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
