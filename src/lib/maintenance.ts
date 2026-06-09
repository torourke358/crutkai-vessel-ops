import type { MaintenanceTask } from "@/lib/types";
import type { MaintenanceDashboardTask } from "@/components/MaintenanceDashboard";

export type DueState = "ok" | "due" | "overdue";

export interface DueInfo {
  state: DueState;
  // For calendar tasks: ISO date when next due. For hours tasks: hours value when next due.
  dueAt: string | number | null;
}

// Treats never-completed tasks as `due` so they show up on the dashboard.
export function computeDueState(
  task: Pick<
    MaintenanceTask,
    | "due_type"
    | "interval_days"
    | "interval_hours"
    | "last_done_date"
    | "hours_at_last_done"
  >,
  currentHours: number | null,
  asOfDateISO: string, // YYYY-MM-DD local
): DueInfo {
  if (task.due_type === "calendar") {
    if (!task.interval_days) return { state: "due", dueAt: null };
    if (!task.last_done_date) return { state: "due", dueAt: null };

    const next = addDays(task.last_done_date, task.interval_days);
    if (next < asOfDateISO) return { state: "overdue", dueAt: next };
    if (next === asOfDateISO) return { state: "due", dueAt: next };
    return { state: "ok", dueAt: next };
  }

  if (!task.interval_hours) return { state: "due", dueAt: null };
  const base = task.hours_at_last_done ?? 0;
  const next = base + task.interval_hours;
  if (currentHours == null) return { state: "due", dueAt: next };
  if (currentHours > next) return { state: "overdue", dueAt: next };
  if (currentHours >= next) return { state: "due", dueAt: next };
  return { state: "ok", dueAt: next };
}

// "Due soon" window: 10% of the hours interval, or 14 days for calendar.
// Returns true only when the task is still OK but about to flip to due.
export function isDueSoon(
  task: Pick<
    MaintenanceTask,
    | "due_type"
    | "interval_days"
    | "interval_hours"
    | "last_done_date"
    | "hours_at_last_done"
  >,
  currentHours: number | null,
  asOfDateISO: string,
): boolean {
  if (task.due_type === "calendar") {
    if (!task.interval_days || !task.last_done_date) return false;
    const next = addDays(task.last_done_date, task.interval_days);
    const horizon = addDays(asOfDateISO, 14);
    return next > asOfDateISO && next <= horizon;
  }
  if (!task.interval_hours) return false;
  if (currentHours == null) return false;
  const base = task.hours_at_last_done ?? 0;
  const next = base + task.interval_hours;
  const window = next - task.interval_hours * 0.10;
  return currentHours >= window && currentHours < next;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Single source of truth for the maintenance-dashboard task list. Both the
// /maintenance route and the / (Daily) landing page call this so they never
// drift apart — same query, same enrichment, same due-state math. `supabase`
// is the request-scoped server client; typing it via the createClient return
// avoids importing the module at runtime (keeps this file client-safe for the
// pure due-state helpers above).
type ServerClient = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createClient>
>;

interface DashboardTaskRow {
  id: string;
  title: string;
  priority: "low" | "moderate" | "high" | "critical" | null;
  due_type: "calendar" | "hours";
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  hours_at_last_done: number | null;
  equipment: {
    name: string;
    current_hours: number | null;
    component: { name: string } | null;
  } | null;
}

interface DashboardHistoryRow {
  task_id: string;
  completed_at: string;
  hours_at_completion: number | null;
  comments: string | null;
}

export async function loadMaintenanceDashboardTasks(
  supabase: ServerClient,
  asOf: string,
): Promise<MaintenanceDashboardTask[]> {
  const { data: tasks } = await supabase
    .from("maintenance_tasks")
    .select(
      "id, title, priority, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, equipment:equipment(name, current_hours, component:components(name))",
    )
    .eq("active", true)
    .order("title", { ascending: true })
    .returns<DashboardTaskRow[]>();

  // Last sign-off per task — feeds the "last done @ hrs" line on each row.
  const taskIds = (tasks ?? []).map((t) => t.id);
  const lastHistoryById = new Map<string, DashboardHistoryRow>();
  if (taskIds.length > 0) {
    const { data: histRows } = await supabase
      .from("maintenance_history")
      .select("task_id, completed_at, hours_at_completion, comments")
      .in("task_id", taskIds)
      .order("completed_at", { ascending: false })
      .returns<DashboardHistoryRow[]>();
    for (const h of histRows ?? []) {
      if (!lastHistoryById.has(h.task_id)) lastHistoryById.set(h.task_id, h);
    }
  }

  return (tasks ?? []).map((t) => {
    const core = {
      due_type: t.due_type,
      interval_days: t.interval_days,
      interval_hours: t.interval_hours,
      last_done_date: t.last_done_date,
      hours_at_last_done: t.hours_at_last_done,
    };
    const currentHours = t.equipment?.current_hours ?? null;
    const due = computeDueState(core, currentHours, asOf);
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
      dueSoon: isDueSoon(core, currentHours, asOf),
    };
  });
}
