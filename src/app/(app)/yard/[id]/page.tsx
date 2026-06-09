import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HIDDEN_CREW_ID } from "@/lib/crew";
import { getUserRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import YardBoard, { type BoardQuadrant } from "@/components/YardBoard";
import type {
  UserProfile,
  YardPeriod,
  YardQuadrant,
  YardTask,
  YardTaskComment,
  YardTaskDocument,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function YardPeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const role = await getUserRole();

  const [
    { data: period },
    { data: quadrants },
    { data: tasks },
    { data: users },
  ] = await Promise.all([
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
      .neq("id", HIDDEN_CREW_ID)
      .order("full_name")
      .returns<Pick<UserProfile, "id" | "full_name">[]>(),
  ]);

  if (!period) notFound();

  const taskIds = (tasks ?? []).map((t) => t.id);
  const [{ data: comments }, { data: documents }] = taskIds.length
    ? await Promise.all([
        supabase
          .from("yard_task_comments")
          .select()
          .in("yard_task_id", taskIds)
          .order("created_at", { ascending: true })
          .returns<YardTaskComment[]>(),
        supabase
          .from("yard_task_documents")
          .select()
          .in("yard_task_id", taskIds)
          .order("uploaded_at", { ascending: false })
          .returns<YardTaskDocument[]>(),
      ])
    : [{ data: [] as YardTaskComment[] }, { data: [] as YardTaskDocument[] }];

  const commentsByTask = new Map<string, YardTaskComment[]>();
  for (const c of comments ?? []) {
    const arr = commentsByTask.get(c.yard_task_id) ?? [];
    arr.push(c);
    commentsByTask.set(c.yard_task_id, arr);
  }
  const docsByTask = new Map<string, YardTaskDocument[]>();
  for (const d of documents ?? []) {
    const arr = docsByTask.get(d.yard_task_id) ?? [];
    arr.push(d);
    docsByTask.set(d.yard_task_id, arr);
  }

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
        commentsByTask={commentsByTask}
        documentsByTask={docsByTask}
      />
    </div>
  );
}
