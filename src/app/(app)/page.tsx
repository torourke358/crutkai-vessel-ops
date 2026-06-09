import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { loadMaintenanceDashboardTasks } from "@/lib/maintenance";
import MaintenanceDashboard from "@/components/MaintenanceDashboard";
import type { YardPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const today = todayLocal();

  const [
    userResult,
    { count: noStock },
    { count: critical },
    { count: inventoryOk },
    maintTasks,
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
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("alert_state", "above")
      .gt("quantity", 0),
    // Same loader the /maintenance dashboard uses — single query path so the
    // Daily list and the summary card never disagree.
    loadMaintenanceDashboardTasks(supabase, today),
    // Prefer an active period; fall back to the most recent planned one so a
    // period created with status='planned' (the default) still shows up
    // before someone manually promotes it. 'active' < 'planned' alphabetically
    // so ascending status puts active first.
    supabase
      .from("yard_periods")
      .select()
      .in("status", ["active", "planned"])
      .order("status", { ascending: true })
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle<YardPeriod>(),
  ]);

  let dueToday = 0;
  let overdue = 0;
  let maintenanceOk = 0;
  for (const t of maintTasks) {
    if (t.state === "due") dueToday++;
    else if (t.state === "overdue") overdue++;
    else maintenanceOk++;
  }

  // Auto-promote a planned period to active once its start_date arrives.
  // Service-role client because RLS restricts yard_period writes to admins,
  // and we want this to fire for any viewer who hits the dashboard.
  if (
    activePeriod &&
    activePeriod.status === "planned" &&
    activePeriod.start_date <= today
  ) {
    const admin = createServiceClient();
    await admin
      .from("yard_periods")
      .update({ status: "active" })
      .eq("id", activePeriod.id);
    activePeriod.status = "active";
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
      {/* Daily to-do — lead with what's actionable today. Same three sections
          as the /maintenance dashboard (time due / hours due / overdue). */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">
            Today&apos;s maintenance
          </h1>
          <Link
            href="/maintenance"
            className="text-sm font-medium text-slate-500 hover:text-violet-700"
          >
            Full dashboard
          </Link>
        </div>
        <MaintenanceDashboard tasks={maintTasks} asOf={today} />
      </section>

      {/* Vessel banner — matches petty-cash's "Anne Marie" header. */}
      <div className="relative h-40 overflow-hidden rounded-2xl bg-slate-200 sm:h-48">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vessel.png"
          alt="M/Y Anne-Marie"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 text-white drop-shadow-lg">
          <p className="text-3xl font-bold leading-none sm:text-4xl">Runa</p>
          <p className="mt-1 text-lg font-semibold leading-tight sm:text-xl">
            M/Y Anne-Marie
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Welcome aboard.</h2>
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

        {/* All clear — everything not flagged anywhere else */}
        <div className="block rounded-2xl bg-white p-5 ring-1 ring-slate-100 sm:col-span-2">
          <p className="text-base font-semibold text-slate-900">All clear</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Items above critical and tasks comfortably out from due.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="Inventory OK" value={inventoryOk ?? 0} tone="emerald" />
            <Stat label="Maintenance OK" value={maintenanceOk} tone="emerald" />
          </div>
        </div>

        {/* Yard */}
        <Link
          href={activePeriod ? `/yard/${activePeriod.id}` : "/yard"}
          className="block rounded-2xl bg-white p-5 ring-1 ring-slate-100 transition-shadow hover:shadow-sm sm:col-span-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-slate-900">
                Yard period
              </p>
              {activePeriod && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    activePeriod.status === "active"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {activePeriod.status === "active" ? "Active" : "Planned"}
                </span>
              )}
            </div>
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
              No active or planned yard period. Plan one to see status here.
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
