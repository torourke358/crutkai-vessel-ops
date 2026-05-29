import type { MaintenanceTask } from "@/lib/types";

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

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
