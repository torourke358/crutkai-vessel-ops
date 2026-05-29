import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import YardKanban, {
  type YardKanbanQuadrant,
  type YardKanbanTask,
} from "@/components/YardKanban";
import type { YardPeriod, YardQuadrant, YardTask } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function YardPeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const role = await getUserRole();

  const [{ data: period }, { data: quadrants }, { data: tasks }, { data: users }] = await Promise.all([
    supabase.from("yard_periods").select().eq("id", id).single<YardPeriod>(),
    supabase
      .from("yard_quadrants")
      .select()
      .eq("yard_period_id", id)
      .order("display_order")
      .returns<YardQuadrant[]>(),
    supabase
      .from("yard_tasks")
      .select(
        "id, title, status, progress_pct, effort, due_date, actual_cost, owner_id, quadrant_id",
      )
      .eq("yard_period_id", id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .returns<(Pick<
        YardTask,
        | "id"
        | "title"
        | "status"
        | "progress_pct"
        | "effort"
        | "due_date"
        | "actual_cost"
        | "owner_id"
      > & { quadrant_id: string })[]>(),
    supabase.from("user_profiles").select("id, full_name"),
  ]);

  if (!period) notFound();

  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name] as const));

  const byQuadrant: YardKanbanQuadrant[] = (quadrants ?? []).map((q) => ({
    ...q,
    tasks: (tasks ?? [])
      .filter((t) => t.quadrant_id === q.id)
      .map<YardKanbanTask>((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        progress_pct: t.progress_pct,
        effort: t.effort,
        due_date: t.due_date,
        actual_cost: t.actual_cost,
        owner_id: t.owner_id,
        ownerName: t.owner_id ? (nameById.get(t.owner_id) ?? null) : null,
      })),
  }));

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{period.name}</h1>
          <p className="text-sm text-slate-500">
            {formatDate(period.start_date)}
            {period.end_date && <span> → {formatDate(period.end_date)}</span>} · {period.status}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/yard" className="font-medium text-slate-500 hover:text-violet-700">
            All periods
          </Link>
          {role === "admin" && (
            <Link
              href={`/yard/${period.id}/manage`}
              className="font-medium text-slate-500 hover:text-violet-700"
            >
              Edit
            </Link>
          )}
        </div>
      </div>

      <YardKanban periodId={period.id} quadrants={byQuadrant} isAdmin={role === "admin"} />
    </div>
  );
}
