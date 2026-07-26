import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import NewPlanForm from "@/components/drydock/NewPlanForm";
import type { DisassemblyPlan, YardPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  final: "bg-violet-100 text-violet-800",
  converted: "bg-emerald-100 text-emerald-800",
};

export default async function DrydockPlannerPage() {
  if ((await getUserRole()) !== "admin") redirect("/yard");

  const supabase = await createClient();
  const [{ data: periods }, { data: plans }] = await Promise.all([
    supabase
      .from("yard_periods")
      .select()
      .order("start_date", { ascending: false })
      .returns<YardPeriod[]>(),
    supabase
      .from("disassembly_plans")
      .select()
      .order("created_at", { ascending: false })
      .returns<DisassemblyPlan[]>(),
  ]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Dry-dock planner</h1>
        <Link href="/yard" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <NewPlanForm periods={periods ?? []} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Plans</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {(plans ?? []).length === 0 ? (
            <li className="p-6 text-center text-sm text-slate-400">
              No plans yet. Photograph an area above to make one.
            </li>
          ) : (
            (plans ?? []).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/yard/planner/${p.id}`}
                  className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{p.area_name}</p>
                    <p className="text-sm text-slate-500">
                      {p.photo_paths.length} photo(s) · {formatDate(p.created_at.slice(0, 10))}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    {p.status}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
