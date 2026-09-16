import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HIDDEN_CREW_ID } from "@/lib/crew";
import { loadYardPeriod } from "@/lib/yard-period-page";
import YardPeriodHeader from "@/components/YardPeriodHeader";
import YardBoard, { type BoardQuadrant } from "@/components/YardBoard";
import type { UserProfile, YardTaskComment, YardTaskDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function YardPeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await loadYardPeriod(id);
  if (!ctx.period) notFound();

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .eq("active", true)
    .neq("id", HIDDEN_CREW_ID)
    .order("full_name")
    .returns<Pick<UserProfile, "id" | "full_name">[]>();

  const taskIds = ctx.tasks.map((t) => t.id);
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

  const board: BoardQuadrant[] = ctx.quadrants.map((q) => ({
    ...q,
    tasks: ctx.tasks.filter((t) => t.quadrant_id === q.id),
  }));

  return (
    <div className="space-y-5 pb-8">
      <YardPeriodHeader
        period={ctx.period}
        active="board"
        isAdmin={ctx.isAdmin}
        money={ctx.money?.blocks[0] ?? null}
        clashCount={ctx.clashCount}
      />

      <YardBoard
        periodId={ctx.period.id}
        quadrants={board}
        users={users ?? []}
        isAdmin={ctx.isAdmin}
        commentsByTask={commentsByTask}
        documentsByTask={docsByTask}
        zones={ctx.zones}
      />
    </div>
  );
}
