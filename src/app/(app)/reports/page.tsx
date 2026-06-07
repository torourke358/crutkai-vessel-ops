import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatAmount, formatDate, todayLocal } from "@/lib/format";
import { computeDueState, isDueSoon } from "@/lib/maintenance";
import ReportsDateRange from "@/components/ReportsDateRange";
import PieChart from "@/components/PieChart";
import { computeStatus, STATUS_LABELS, type InventoryStatus } from "@/lib/inventory";
import type {
  DueType,
  YardTaskStatus,
  YardTaskUrgency,
} from "@/lib/types";
import { YARD_TASK_URGENCY_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

interface MaintTaskRow {
  id: string;
  title: string;
  due_type: DueType;
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  hours_at_last_done: number | null;
  priority: "low" | "moderate" | "high" | "critical" | null;
  equipment: { name: string; current_hours: number | null } | null;
}

interface YardRow {
  id: string;
  yard_period_id: string;
  quadrant_id: string;
  title: string;
  status: YardTaskStatus;
  urgency: YardTaskUrgency | null;
  owner_id: string | null;
  due_date: string | null;
  progress_pct: number;
}

interface YardHistoryRow {
  id: string;
  title: string;
  effort: "S" | "M" | "L" | null;
  completed_at: string | null;
  completed_by: string | null;
}

interface MaintenanceHistoryRow {
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

const URGENCY_TONE: Record<YardTaskUrgency, string> = {
  fires: "bg-rose-100 text-rose-700",
  prioritize: "bg-amber-100 text-amber-700",
  reduce: "bg-sky-100 text-sky-700",
  repository: "bg-slate-100 text-slate-600",
};

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

  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const [
    { data: maintTasks },
    { data: yardOpen },
    { data: yardHist },
    { data: maintHist },
    { data: partsHist },
    { data: users },
    { data: periods },
    { data: quadrants },
    { data: yardCost },
    { data: inventoryItems },
  ] = await Promise.all([
    supabase
      .from("maintenance_tasks")
      .select(
        "id, title, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, priority, equipment:equipment(name, current_hours)",
      )
      .eq("active", true)
      .returns<MaintTaskRow[]>(),
    // Open yard tasks from non-closed periods.
    supabase
      .from("yard_tasks")
      .select(
        "id, yard_period_id, quadrant_id, title, status, urgency, owner_id, due_date, progress_pct, period:yard_periods!inner(status)",
      )
      .neq("status", "done")
      .neq("period.status", "closed")
      .order("due_date", { ascending: true, nullsFirst: false })
      .returns<(YardRow & { period: { status: string } })[]>(),
    supabase
      .from("yard_tasks")
      .select("id, title, effort, completed_at, completed_by")
      .gte("completed_at", fromIso)
      .lte("completed_at", toIso)
      .order("completed_at", { ascending: false })
      .returns<YardHistoryRow[]>(),
    supabase
      .from("maintenance_history")
      .select(
        "id, task_id, completed_at, completed_by, hours_at_completion, maintenance_task:maintenance_tasks(title, equipment:equipment(name))",
      )
      .gte("completed_at", fromIso)
      .lte("completed_at", toIso)
      .order("completed_at", { ascending: false })
      .returns<MaintenanceHistoryRow[]>(),
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
    supabase.from("yard_periods").select("id, name"),
    supabase.from("yard_quadrants").select("id, name, color"),
    // Yard cost by quadrant — completed tasks with a recorded cost, same date
    // scope as the throughput report below. actual_cost is the only cost data
    // in the app; quadrants are the colored categories.
    supabase
      .from("yard_tasks")
      .select("quadrant_id, actual_cost")
      .gte("completed_at", fromIso)
      .lte("completed_at", toIso)
      .not("actual_cost", "is", null)
      .returns<{ quadrant_id: string; actual_cost: number | null }[]>(),
    supabase
      .from("inventory_items")
      .select("quantity, critical_threshold")
      .returns<{ quantity: number; critical_threshold: number | null }[]>(),
  ]);

  const nameById = new Map(
    (users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const),
  );
  const periodById = new Map((periods ?? []).map((p) => [p.id, p.name] as const));
  const quadById = new Map((quadrants ?? []).map((q) => [q.id, q.name] as const));
  const quadColorById = new Map(
    (quadrants ?? []).map((q) => [q.id, q.color] as const),
  );

  // Cost by quadrant. Quadrants are period-scoped, so the same category lives
  // in several periods; aggregate by quadrant NAME and take the first color we
  // see for that name (template colors are consistent across periods).
  const costByName = new Map<
    string,
    { name: string; color: string; total: number }
  >();
  for (const r of yardCost ?? []) {
    const cost = r.actual_cost ?? 0;
    if (cost <= 0) continue;
    const name = quadById.get(r.quadrant_id) ?? "Unassigned";
    const color = quadColorById.get(r.quadrant_id) ?? "#94a3b8"; // slate-400
    const cur = costByName.get(name) ?? { name, color, total: 0 };
    cur.total += cost;
    costByName.set(name, cur);
  }
  const costSlices = [...costByName.values()].sort((a, b) => b.total - a.total);

  // -------- OPERATIONAL (current state) --------

  const overdue: {
    task: MaintTaskRow;
    dueAt: string | number | null;
  }[] = [];
  const dueSoon: {
    task: MaintTaskRow;
    nextDue: string | number | null;
    remaining: string;
  }[] = [];

  for (const t of maintTasks ?? []) {
    const due = computeDueState(t, t.equipment?.current_hours ?? null, today);
    if (due.state === "overdue" || due.state === "due") {
      overdue.push({ task: t, dueAt: due.dueAt });
      continue;
    }
    if (isDueSoon(t, t.equipment?.current_hours ?? null, today)) {
      let nextDue: string | number | null = null;
      let remaining = "—";
      if (t.due_type === "hours" && t.interval_hours != null) {
        const base = t.hours_at_last_done ?? 0;
        nextDue = base + t.interval_hours;
        const current = t.equipment?.current_hours ?? 0;
        remaining = `${nextDue - current} hrs`;
      } else if (t.due_type === "calendar" && due.dueAt) {
        nextDue = due.dueAt;
        if (typeof due.dueAt === "string") {
          const [y, m, d] = due.dueAt.split("-").map(Number);
          const [ty, tm, td] = today.split("-").map(Number);
          const next = new Date(y, m - 1, d, 12).getTime();
          const now = new Date(ty, tm - 1, td, 12).getTime();
          const days = Math.round((next - now) / (1000 * 60 * 60 * 24));
          remaining = `${days} d`;
        }
      }
      dueSoon.push({ task: t, nextDue, remaining });
    }
  }

  const yardTodo = yardOpen ?? [];

  // -------- HISTORICAL (in date range) --------

  const yardSummary = new Map<
    string,
    { name: string; count: number; s: number; m: number; l: number }
  >();
  for (const r of yardHist ?? []) {
    const key = r.completed_by ?? "unassigned";
    const name = r.completed_by ? nameById.get(r.completed_by) ?? "Unknown" : "Unassigned";
    const cur = yardSummary.get(key) ?? { name, count: 0, s: 0, m: 0, l: 0 };
    cur.count++;
    if (r.effort === "S") cur.s++;
    if (r.effort === "M") cur.m++;
    if (r.effort === "L") cur.l++;
    yardSummary.set(key, cur);
  }
  const yardSummaryRows = [...yardSummary.values()].sort((a, b) => b.count - a.count);

  const maintSummary = new Map<string, { name: string; count: number }>();
  for (const r of maintHist ?? []) {
    const key = r.completed_by ?? "unassigned";
    const name = r.completed_by ? nameById.get(r.completed_by) ?? "Unknown" : "Unassigned";
    const cur = maintSummary.get(key) ?? { name, count: 0 };
    cur.count++;
    maintSummary.set(key, cur);
  }
  const maintSummaryRows = [...maintSummary.values()].sort((a, b) => b.count - a.count);

  const partsSummary = new Map<string, { name: string; unit: string; qty: number }>();
  for (const r of partsHist ?? []) {
    const name = r.inventory_item?.part_name ?? "(deleted item)";
    const unit = r.inventory_item?.unit ?? "Units";
    const cur = partsSummary.get(name) ?? { name, unit, qty: 0 };
    cur.qty += r.qty_used;
    partsSummary.set(name, cur);
  }
  const partsSummaryRows = [...partsSummary.values()].sort((a, b) => b.qty - a.qty);

  // ---- Current-state pie breakdowns (maintenance due-state, inventory stock).
  const maintCounts = { overdue: 0, due: 0, dueSoon: 0, ok: 0 };
  for (const t of maintTasks ?? []) {
    const d = computeDueState(t, t.equipment?.current_hours ?? null, today);
    if (d.state === "overdue") maintCounts.overdue++;
    else if (d.state === "due") maintCounts.due++;
    else if (isDueSoon(t, t.equipment?.current_hours ?? null, today)) maintCounts.dueSoon++;
    else maintCounts.ok++;
  }
  const maintStatusSlices = [
    { label: "Overdue", value: maintCounts.overdue, color: "#e11d48" },
    { label: "Due", value: maintCounts.due, color: "#f59e0b" },
    { label: "Due soon", value: maintCounts.dueSoon, color: "#0ea5e9" },
    { label: "OK", value: maintCounts.ok, color: "#10b981" },
  ];

  const invColor: Record<InventoryStatus, string> = {
    ok: "#10b981",
    critical: "#f59e0b",
    no_stock: "#e11d48",
  };
  const invCounts: Record<InventoryStatus, number> = { ok: 0, critical: 0, no_stock: 0 };
  for (const r of inventoryItems ?? []) {
    invCounts[computeStatus(r.quantity, r.critical_threshold)]++;
  }
  const inventoryStatusSlices = (Object.keys(invCounts) as InventoryStatus[]).map((k) => ({
    label: STATUS_LABELS[k],
    value: invCounts[k],
    color: invColor[k],
  }));

  const qs = `?from=${from}&to=${to}`;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Reports</h1>
        <ReportsDateRange initialFrom={from} initialTo={to} />
      </div>

      {/* Operational — current state, ignores date range */}
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Current state
      </h2>

      {/* Maintenance status — tasks by due-state */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Maintenance status</h3>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <PieChart
            slices={maintStatusSlices}
            totalLabel="Tasks"
            emptyLabel="No maintenance tasks yet."
          />
        </div>
      </section>

      {/* Inventory status — items by stock level */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Inventory status</h3>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <PieChart
            slices={inventoryStatusSlices}
            totalLabel="Items"
            emptyLabel="No inventory items yet."
          />
        </div>
      </section>

      {/* Maintenance overdue */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Maintenance overdue
          </h3>
          <a
            href="/api/reports/maintenance-overdue/export"
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Numbers
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {overdue.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">
              Nothing overdue. 🎉
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-rose-50 text-xs uppercase tracking-wide text-rose-700">
                <tr>
                  <th className="px-3 py-2 text-left">Task</th>
                  <th className="px-3 py-2 text-left">Equipment</th>
                  <th className="px-3 py-2 text-left">Due</th>
                  <th className="px-3 py-2 text-left">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdue.map(({ task, dueAt }) => (
                  <tr key={task.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/maintenance/tasks/${task.id}`}
                        className="font-medium text-slate-900 hover:text-violet-700"
                      >
                        {task.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {task.equipment?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {task.due_type === "hours"
                        ? `${dueAt ?? "—"} hrs (current ${task.equipment?.current_hours ?? "—"})`
                        : typeof dueAt === "string"
                          ? formatDate(dueAt)
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {task.priority ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Maintenance due soon */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Maintenance due soon
          </h3>
          <a
            href="/api/reports/maintenance-due-soon/export"
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Numbers
          </a>
        </div>
        <p className="text-xs text-slate-400">
          Hours-based PMs within the last 10% of their interval and calendar
          PMs within 14 days of due.
        </p>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {dueSoon.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">
              Nothing close to due.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-700">
                <tr>
                  <th className="px-3 py-2 text-left">Task</th>
                  <th className="px-3 py-2 text-left">Equipment</th>
                  <th className="px-3 py-2 text-left">Next due</th>
                  <th className="px-3 py-2 text-left">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dueSoon.map(({ task, nextDue, remaining }) => (
                  <tr key={task.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/maintenance/tasks/${task.id}`}
                        className="font-medium text-slate-900 hover:text-violet-700"
                      >
                        {task.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {task.equipment?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {task.due_type === "hours"
                        ? `${nextDue ?? "—"} hrs`
                        : typeof nextDue === "string"
                          ? formatDate(nextDue)
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Yard tasks to complete */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Yard tasks to complete
          </h3>
          <a
            href="/api/reports/yard-todo/export"
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Numbers
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {yardTodo.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">
              No open yard tasks.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Task</th>
                  <th className="px-3 py-2 text-left">Quadrant</th>
                  <th className="px-3 py-2 text-left">Period</th>
                  <th className="px-3 py-2 text-left">Owner</th>
                  <th className="px-3 py-2 text-left">Urgency</th>
                  <th className="px-3 py-2 text-left">Due</th>
                  <th className="px-3 py-2 text-right">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yardTodo.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2">
                      <Link
                        href={`/yard/${t.yard_period_id}`}
                        className="font-medium text-slate-900 hover:text-violet-700"
                      >
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {quadById.get(t.quadrant_id) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {periodById.get(t.yard_period_id) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {t.owner_id ? nameById.get(t.owner_id) ?? "Unknown" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {t.urgency ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${URGENCY_TONE[t.urgency]}`}
                        >
                          {YARD_TASK_URGENCY_LABELS[t.urgency].split(" ")[0]}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {t.due_date ? formatDate(t.due_date) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {t.progress_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Historical — date range applies */}
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Activity between <strong>{formatDate(from)}</strong> and{" "}
        <strong>{formatDate(to)}</strong>
      </h2>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Yard task throughput
          </h3>
          <a
            href={`/api/reports/yard/export${qs}`}
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Numbers
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {yardSummaryRows.length === 0 ? (
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
                {yardSummaryRows.map((r) => (
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

      {/* Yard cost by quadrant — CSS conic-gradient pie, no chart library.
          Same date scope as the throughput report above. */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Yard cost by quadrant
        </h3>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <PieChart
            slices={costSlices.map((s) => ({
              label: s.name,
              value: s.total,
              color: s.color,
            }))}
            valueFormat={(n) => formatAmount(n, "USD")}
            emptyLabel="No yard costs recorded in this range."
          />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Maintenance completions
          </h3>
          <a
            href={`/api/reports/maintenance/export${qs}`}
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Numbers
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {maintSummaryRows.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">
              No maintenance sign-offs in this range.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Crew member</th>
                  <th className="px-3 py-2 text-right">Sign-offs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {maintSummaryRows.map((r) => (
                  <tr key={r.name}>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Inventory churn</h3>
          <a
            href={`/api/reports/inventory/export${qs}`}
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            Numbers
          </a>
        </div>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {partsSummaryRows.length === 0 ? (
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
                {partsSummaryRows.map((r) => (
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
    </div>
  );
}
