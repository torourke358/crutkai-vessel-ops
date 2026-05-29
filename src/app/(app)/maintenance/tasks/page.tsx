import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatDate, todayLocal } from "@/lib/format";
import { computeDueState } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

interface TaskRow {
  id: string;
  title: string;
  priority: "low" | "moderate" | "high" | "critical" | null;
  due_type: "calendar" | "hours";
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  hours_at_last_done: number | null;
  active: boolean;
  equipment: { name: string; current_hours: number | null } | null;
}

export default async function AllMaintenanceTasksPage() {
  const supabase = await createClient();
  const role = await getUserRole();

  const { data: rows } = await supabase
    .from("maintenance_tasks")
    .select(
      "id, title, priority, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, active, equipment:equipment(name, current_hours)",
    )
    .order("active", { ascending: false })
    .order("title", { ascending: true })
    .returns<TaskRow[]>();

  const asOf = todayLocal();
  const tasks = rows ?? [];

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">All maintenance tasks</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/maintenance" className="font-medium text-slate-500 hover:text-violet-700">
            Dashboard
          </Link>
          {role === "admin" && (
            <Link
              href="/maintenance/tasks/new"
              className="rounded-xl bg-violet-600 px-4 py-2 font-medium text-white active:bg-violet-700"
            >
              + New task
            </Link>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {tasks.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">
            No tasks yet. Add one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const due = computeDueState(
                {
                  due_type: t.due_type,
                  interval_days: t.interval_days,
                  interval_hours: t.interval_hours,
                  last_done_date: t.last_done_date,
                  hours_at_last_done: t.hours_at_last_done,
                },
                t.equipment?.current_hours ?? null,
                asOf,
              );
              return (
                <li key={t.id}>
                  <Link
                    href={`/maintenance/tasks/${t.id}`}
                    className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {t.title}
                        {!t.active && (
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            (inactive)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {t.equipment?.name ?? "Unknown"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {t.due_type === "calendar"
                          ? `Every ${t.interval_days} day(s)${t.last_done_date ? ` · last ${formatDate(t.last_done_date)}` : ""}`
                          : `Every ${t.interval_hours} hrs${t.hours_at_last_done != null ? ` · last @ ${t.hours_at_last_done} hrs` : ""}`}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        due.state === "overdue"
                          ? "bg-rose-100 text-rose-800"
                          : due.state === "due"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {due.state}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
