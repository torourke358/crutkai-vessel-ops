import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { computeDueState } from "@/lib/maintenance";
import type { DueType } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  title: string;
  due_type: DueType;
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  hours_at_last_done: number | null;
  equipment: { name: string; current_hours: number | null } | null;
}

// Month grid plotting calendar PMs by their next-due date and hours PMs in
// a separate side panel. Mobile-friendly: 7-col grid that scrolls vertically.
export default async function MaintenanceCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const sp = await searchParams;
  const today = todayLocal();
  const now = new Date(today + "T12:00:00");
  const year = sp.y ? Number(sp.y) : now.getFullYear();
  const month = sp.m ? Number(sp.m) - 1 : now.getMonth(); // 0..11

  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("maintenance_tasks")
    .select(
      "id, title, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, equipment:equipment(name, current_hours)",
    )
    .eq("active", true)
    .returns<Row[]>();

  // Build a map of YYYY-MM-DD -> list of calendar tasks due that day.
  const byDate = new Map<string, Row[]>();
  const hoursTasks: { row: Row; remaining: number | "due" | "overdue" }[] = [];

  for (const t of tasks ?? []) {
    const due = computeDueState(
      {
        due_type: t.due_type,
        interval_days: t.interval_days,
        interval_hours: t.interval_hours,
        last_done_date: t.last_done_date,
        hours_at_last_done: t.hours_at_last_done,
      },
      t.equipment?.current_hours ?? null,
      today,
    );
    if (t.due_type === "calendar") {
      if (typeof due.dueAt === "string") {
        const arr = byDate.get(due.dueAt) ?? [];
        arr.push(t);
        byDate.set(due.dueAt, arr);
      }
    } else {
      const next = (t.hours_at_last_done ?? 0) + (t.interval_hours ?? 0);
      const current = t.equipment?.current_hours ?? null;
      if (current == null) {
        hoursTasks.push({ row: t, remaining: "due" });
      } else if (current > next) {
        hoursTasks.push({ row: t, remaining: "overdue" });
      } else if (current >= next) {
        hoursTasks.push({ row: t, remaining: "due" });
      } else {
        hoursTasks.push({ row: t, remaining: next - current });
      }
    }
  }

  // Build month grid.
  const firstOfMonth = new Date(year, month, 1, 12);
  const startDow = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const cells: { date: string | null; dayNum: number | null; isToday: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ date: null, dayNum: null, isToday: false });
    } else {
      const mm = String(month + 1).padStart(2, "0");
      const dd = String(dayNum).padStart(2, "0");
      const date = `${year}-${mm}-${dd}`;
      cells.push({ date, dayNum, isToday: date === today });
    }
  }

  const prevMonth = month === 0 ? { y: year - 1, m: 12 } : { y: year, m: month };
  const nextMonth = month === 11 ? { y: year + 1, m: 1 } : { y: year, m: month + 2 };
  const monthLabel = firstOfMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const hoursSorted = [...hoursTasks].sort((a, b) => {
    const order = (r: typeof a.remaining) =>
      r === "overdue" ? -2 : r === "due" ? -1 : (r as number);
    return order(a.remaining) - order(b.remaining);
  });

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">
          Maintenance · Calendar
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/maintenance/calendar?y=${prevMonth.y}&m=${prevMonth.m}`}
            className="text-slate-500 hover:text-violet-700"
          >
            ← Prev
          </Link>
          <span className="font-semibold text-slate-900">{monthLabel}</span>
          <Link
            href={`/maintenance/calendar?y=${nextMonth.y}&m=${nextMonth.m}`}
            className="text-slate-500 hover:text-violet-700"
          >
            Next →
          </Link>
          <Link
            href="/maintenance"
            className="ml-2 font-medium text-slate-500 hover:text-violet-700"
          >
            Dashboard
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-slate-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-slate-50 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          const tasksOnDay = c.date ? byDate.get(c.date) ?? [] : [];
          return (
            <div
              key={i}
              className={`min-h-[88px] bg-white p-1.5 text-xs ${
                c.isToday ? "ring-2 ring-violet-400" : ""
              }`}
            >
              {c.dayNum != null && (
                <>
                  <div
                    className={`mb-1 text-right ${
                      c.isToday ? "font-bold text-violet-700" : "text-slate-400"
                    }`}
                  >
                    {c.dayNum}
                  </div>
                  <ul className="space-y-0.5">
                    {tasksOnDay.slice(0, 3).map((t) => {
                      const overdue = c.date! < today;
                      return (
                        <li key={t.id}>
                          <Link
                            href={`/maintenance/tasks/${t.id}`}
                            className={`block truncate rounded px-1 ${
                              overdue
                                ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
                                : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                            }`}
                            title={`${t.title} · ${t.equipment?.name ?? ""}`}
                          >
                            {t.title}
                          </Link>
                        </li>
                      );
                    })}
                    {tasksOnDay.length > 3 && (
                      <li className="px-1 text-[10px] text-slate-400">
                        +{tasksOnDay.length - 3} more
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>

      {hoursSorted.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Hours-based tasks
          </h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
            {hoursSorted.map(({ row, remaining }) => {
              const badge =
                remaining === "overdue"
                  ? { label: "Overdue", cls: "bg-rose-100 text-rose-700" }
                  : remaining === "due"
                    ? { label: "Due", cls: "bg-amber-100 text-amber-700" }
                    : { label: `${remaining} hrs`, cls: "bg-slate-100 text-slate-600" };
              return (
                <li key={row.id}>
                  <Link
                    href={`/maintenance/tasks/${row.id}`}
                    className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {row.title}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {row.equipment?.name ?? "—"} · every{" "}
                        {row.interval_hours} hrs
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
