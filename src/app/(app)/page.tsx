import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { computeDueState } from "@/lib/maintenance";
import type { YardPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const today = todayLocal();

  const [
    userResult,
    { count: noStock },
    { count: critical },
    { data: maintTasks },
    { data: activePeriod },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("quantity", 0),
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("alert_state", "at_or_below")
      .gt("quantity", 0),
    supabase
      .from("maintenance_tasks")
      .select(
        "id, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, equipment:equipment(current_hours)",
      )
      .eq("active", true)
      .returns<
        {
          id: string;
          due_type: "calendar" | "hours";
          interval_days: number | null;
          interval_hours: number | null;
          last_done_date: string | null;
          hours_at_last_done: number | null;
          equipment: { current_hours: number | null } | null;
        }[]
      >(),
    supabase
      .from("yard_periods")
      .select()
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle<YardPeriod>(),
  ]);

  let dueToday = 0;
  let overdue = 0;
  for (const t of maintTasks ?? []) {
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
    if (due.state === "due") dueToday++;
    else if (due.state === "overdue") overdue++;
  }

  let yardTodo = 0;
  let yardInProgress = 0;
  let yardDone = 0;
  if (activePeriod) {
    const { data: tasks } = await supabase
      .from("yard_tasks")
      .select("status")
      .eq("yard_period_id", activePeriod.id);
    for (const t of tasks ?? []) {
      if (t.status === "todo") yardTodo++;
      else if (t.status === "in_progress") yardInProgress++;
      else if (t.status === "done") yardDone++;
    }
  }

  const email = userResult.data.user?.email ?? "you";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Welcome aboard.</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as <span className="font-medium">{email}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Inventory */}
        <Link
          href="/inventory"
          className="block rounded-2xl bg-white p-5 ring-1 ring-slate-100 transition-shadow hover:shadow-sm"
        >
          <p className="text-base font-semibold text-slate-900">Inventory</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="No stock" value={noStock ?? 0} tone="rose" />
            <Stat label="Critical" value={critical ?? 0} tone="amber" />
          </div>
        </Link>

        {/* Maintenance */}
        <Link
          href="/maintenance"
          className="block rounded-2xl bg-white p-5 ring-1 ring-slate-100 transition-shadow hover:shadow-sm"
        >
          <p className="text-base font-semibold text-slate-900">Maintenance</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="Due today" value={dueToday} tone="amber" />
            <Stat label="Overdue" value={overdue} tone="rose" />
          </div>
        </Link>

        {/* Yard */}
        <Link
          href={activePeriod ? `/yard/${activePeriod.id}` : "/yard"}
          className="block rounded-2xl bg-white p-5 ring-1 ring-slate-100 transition-shadow hover:shadow-sm sm:col-span-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">
              Active yard period
            </p>
            {activePeriod && <p className="text-sm text-slate-500">{activePeriod.name}</p>}
          </div>
          {activePeriod ? (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="To do" value={yardTodo} tone="slate" />
              <Stat label="In progress" value={yardInProgress} tone="amber" />
              <Stat label="Done" value={yardDone} tone="emerald" />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              No active yard period. Plan or activate one to see status here.
            </p>
          )}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/equipment"
          className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 transition-shadow hover:shadow-sm"
        >
          <p className="text-base font-semibold text-slate-900">Equipment</p>
          <p className="mt-1 text-sm text-slate-500">
            Hour readings, system grouping, and maintenance task source.
          </p>
        </Link>
        <Link
          href="/notifications"
          className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 transition-shadow hover:shadow-sm"
        >
          <p className="text-base font-semibold text-slate-900">Alerts</p>
          <p className="mt-1 text-sm text-slate-500">
            See and manage in-app + email notifications.
          </p>
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "emerald" | "slate";
}) {
  const colors: Record<string, string> = {
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-50 text-slate-700",
  };
  return (
    <div className={`rounded-xl px-3 py-2 ${colors[tone]}`}>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
