import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const bodySchema = z.object({
  quadrant_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  progress_pct: z.number().int().min(0).max(100).default(0),
  effort: z.enum(["S", "M", "L"]).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  reminder_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  resources: z.string().trim().max(4000).nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  actual_cost: z.number().min(0).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { data: row, error } = await supabase
    .from("yard_tasks")
    .insert({ yard_period_id: id, ...parsed.data })
    .select()
    .single();

  if (error || !row) {
    console.error("yard task insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "yard_task",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
