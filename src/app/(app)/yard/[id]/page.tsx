import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import YardBoard, { type BoardQuadrant } from "@/components/YardBoard";
import type { UserProfile, YardPeriod, YardQuadrant, YardTask } from "@/lib/types";

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
      .select()
      .eq("yard_period_id", id)
      .order("created_at", { ascending: true })
      .returns<YardTask[]>(),
    supabase
      .from("user_profiles")
      .select("id, full_name")
      .eq("active", true)
      .order("full_name")
      .returns<Pick<UserProfile, "id" | "full_name">[]>(),
  ]);

  if (!period) notFound();

  const board: BoardQuadrant[] = (quadrants ?? []).map((q) => ({
    ...q,
    tasks: (tasks ?? []).filter((t) => t.quadrant_id === q.id),
  }));

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{period.name}</h1>
          <p className="text-sm text-slate-500">
            {formatDate(period.start_date)}
            {period.end_date && <span> → {formatDate(period.end_date)}</span>}
            {" "}· {period.status}
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

      <YardBoard
        periodId={period.id}
        quadrants={board}
        users={users ?? []}
        isAdmin={role === "admin"}
      />
    </div>
  );
}
