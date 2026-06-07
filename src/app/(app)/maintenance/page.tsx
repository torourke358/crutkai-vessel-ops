import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { todayLocal } from "@/lib/format";
import { loadMaintenanceDashboardTasks } from "@/lib/maintenance";
import MaintenanceDashboard from "@/components/MaintenanceDashboard";

export const dynamic = "force-dynamic";

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const sp = await searchParams;
  const asOf = sp.asOf || todayLocal();

  const supabase = await createClient();
  const role = await getUserRole();

  const enriched = await loadMaintenanceDashboardTasks(supabase, asOf);

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
