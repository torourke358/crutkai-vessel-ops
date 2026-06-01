import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import ChecklistsLauncher from "@/components/ChecklistsLauncher";
import type { ChecklistRun, ChecklistTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ChecklistsPage() {
  const supabase = await createClient();
  const role = await getUserRole();

  const [{ data: templates }, { data: recentRuns }, { data: users }] =
    await Promise.all([
      supabase
        .from("checklist_templates")
        .select()
        .eq("active", true)
        .order("title")
        .returns<ChecklistTemplate[]>(),
      supabase
        .from("checklist_runs")
        .select()
        .order("started_at", { ascending: false })
        .limit(20)
        .returns<ChecklistRun[]>(),
      supabase.from("user_profiles").select("id, full_name"),
    ]);

  const tplById = new Map((templates ?? []).map((t) => [t.id, t.title] as const));
  const nameById = new Map(
    (users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const),
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Checklists</h1>
        {role === "admin" && (
          <Link
            href="/admin/checklists"
            className="text-sm font-medium text-slate-500 hover:text-violet-700"
          >
            Manage templates
          </Link>
        )}
      </div>
      <p className="text-sm text-slate-500">
        Run engine start, dock-out, watch-round, or any other SOP. Each run is
        a snapshot of the template at the moment you started.
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Start a run</h2>
        <ChecklistsLauncher templates={templates ?? []} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Recent runs</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {(recentRuns ?? []).length === 0 ? (
            <li className="p-4 text-center text-sm text-slate-400">
              No runs yet.
            </li>
          ) : (
            (recentRuns ?? []).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/checklists/runs/${r.id}`}
                  className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {tplById.get(r.template_id) ?? "(deleted template)"}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      Started {formatDate(r.started_at.slice(0, 10))}
                      {r.started_by && (
                        <span> · {nameById.get(r.started_by) ?? "Unknown"}</span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      r.completed_at
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {r.completed_at ? "Completed" : "In progress"}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
