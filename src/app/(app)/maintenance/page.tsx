import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { todayLocal } from "@/lib/format";
import { computeDueState } from "@/lib/maintenance";
import MaintenanceDashboard, {
  type MaintenanceDashboardTask,
} from "@/components/MaintenanceDashboard";

export const dynamic = "force-dynamic";

interface TaskRow {
  id: string;
  equipment_id: string;
  title: string;
  priority: "low" | "moderate" | "high" | "critical" | null;
  due_type: "calendar" | "hours";
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  hours_at_last_done: number | null;
  active: boolean;
  equipment: {
    name: string;
    current_hours: number | null;
    component: { name: string } | null;
  } | null;
}

interface HistoryRow {
  task_id: string;
  completed_at: string;
  hours_at_completion: number | null;
  comments: string | null;
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const sp = await searchParams;
  const asOf = sp.asOf || todayLocal();

  const supabase = await createClient();
  const role = await getUserRole();

  const { data: tasks } = await supabase
    .from("maintenance_tasks")
    .select(
      "id, equipment_id, title, priority, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, active, equipment:equipment(name, current_hours, component:components(name))",
    )
    .eq("active", true)
    .order("title", { ascending: true })
    .returns<TaskRow[]>();

  // Last sign-off per task — for the "Hours completed" / "Date completed" cell.
  const taskIds = (tasks ?? []).map((t) => t.id);
  const lastHistoryById = new Map<string, HistoryRow>();
  if (taskIds.length > 0) {
    const { data: histRows } = await supabase
      .from("maintenance_history")
      .select("task_id, completed_at, hours_at_completion, comments")
      .in("task_id", taskIds)
      .order("completed_at", { ascending: false })
      .returns<HistoryRow[]>();
    for (const h of histRows ?? []) {
      if (!lastHistoryById.has(h.task_id)) lastHistoryById.set(h.task_id, h);
    }
  }

  const enriched: MaintenanceDashboardTask[] = (tasks ?? []).map((t) => {
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
    const last = lastHistoryById.get(t.id);
    return {
      id: t.id,
      title: t.title,
      priority: t.priority,
      due_type: t.due_type,
      equipmentName: t.equipment?.name ?? "Unknown",
      componentName: t.equipment?.component?.name ?? null,
      currentHours: t.equipment?.current_hours ?? null,
      lastDoneDate: t.last_done_date,
      lastDoneHours: t.hours_at_last_done,
      lastCompletedAt: last?.completed_at ?? null,
      lastCompletedHours: last?.hours_at_completion ?? null,
      lastCompletedComments: last?.comments ?? null,
      state: due.state,
      dueAt: due.dueAt,
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Maintenance</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <form className="flex items-center gap-2">
            <label htmlFor="asOf" className="text-slate-500">
              As of
            </label>
            <input
              id="asOf"
              name="asOf"
              type="date"
              defaultValue={asOf}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Apply
            </button>
          </form>
          <Link href="/maintenance/calendar" className="font-medium text-slate-500 hover:text-violet-700">
            Calendar
          </Link>
          <Link href="/maintenance/tasks" className="font-medium text-slate-500 hover:text-violet-700">
            All tasks
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

      <MaintenanceDashboard tasks={enriched} asOf={asOf} />
    </div>
  );
}
