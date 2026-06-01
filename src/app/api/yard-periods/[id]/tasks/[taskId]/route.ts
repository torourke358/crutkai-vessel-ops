import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const patchSchema = z.object({
  quadrant_id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  progress_pct: z.number().int().min(0).max(100).optional(),
  effort: z.enum(["S", "M", "L"]).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reminder_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  resources: z.string().trim().max(4000).nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  actual_cost: z.number().min(0).nullable().optional(),
  urgency: z.enum(["fires", "prioritize", "reduce", "repository"]).nullable().optional(),
  follower_ids: z.array(z.string().uuid()).max(10).optional(),
});

type Ctx = { params: Promise<{ id: string; taskId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { taskId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { data: before } = await supabase.from("yard_tasks").select().eq("id", taskId).single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // RLS allows admin or owner. count-based update gives a clean 403 otherwise.
  const { data: after, error, count } = await supabase
    .from("yard_tasks")
    .update(parsed.data, { count: "exact" })
    .eq("id", taskId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  if (!count || !after) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await writeAudit({
    user_id: user.id,
    entity_type: "yard_task",
    entity_id: taskId,
    action: "update",
    before_state: before,
    after_state: after,
  });

  return NextResponse.json(after);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { taskId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase.from("yard_tasks").select().eq("id", taskId).single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error, count } = await supabase
    .from("yard_tasks")
    .delete({ count: "exact" })
    .eq("id", taskId);

  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  if (!count) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await writeAudit({
    user_id: user.id,
    entity_type: "yard_task",
    entity_id: taskId,
    action: "delete",
    before_state: before,
  });

  return NextResponse.json({ ok: true });
}
