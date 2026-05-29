import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  display_order: z.number().int().optional(),
});

type Ctx = { params: Promise<{ id: string; qid: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { qid } = await ctx.params;
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

  const { data: before } = await supabase.from("yard_quadrants").select().eq("id", qid).single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: after, error, count } = await supabase
    .from("yard_quadrants")
    .update(parsed.data, { count: "exact" })
    .eq("id", qid)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  if (!count || !after) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await writeAudit({
    user_id: user.id,
    entity_type: "yard_quadrant",
    entity_id: qid,
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
  const { qid } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase.from("yard_quadrants").select().eq("id", qid).single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error, count } = await supabase
    .from("yard_quadrants")
    .delete({ count: "exact" })
    .eq("id", qid);

  if (error) {
    // ON DELETE RESTRICT from yard_tasks → quadrants. Surface a friendly message.
    return NextResponse.json(
      { error: "delete_failed", message: "Move or delete tasks in this quadrant first." },
      { status: 409 },
    );
  }
  if (!count) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await writeAudit({
    user_id: user.id,
    entity_type: "yard_quadrant",
    entity_id: qid,
    action: "delete",
    before_state: before,
  });

  return NextResponse.json({ ok: true });
}
