import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  comments: z.string().trim().max(2000).nullable().optional(),
  hours_at_completion: z.number().int().min(0).nullable().optional(),
  parts: z
    .array(
      z.object({
        inventory_item_id: z.string().uuid(),
        qty_used: z.number().int().positive(),
      }),
    )
    .optional()
    .default([]),
});

type Ctx = { params: Promise<{ id: string }> };

// Sign-off — any signed-in user. Uses complete_maintenance_task RPC which
// is security-definer so crew can advance the task without admin write
// access to maintenance_tasks itself.
export async function POST(request: Request, ctx: Ctx) {
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
  const b = parsed.data;

  const { data: historyId, error } = await supabase.rpc("complete_maintenance_task", {
    p_task_id: id,
    p_completed_by: user.id,
    p_hours_at_completion: b.hours_at_completion ?? null,
    p_comments: b.comments ?? null,
    p_parts: b.parts && b.parts.length > 0 ? b.parts : null,
  });

  if (error) {
    console.error("complete_maintenance_task failed", error);
    return NextResponse.json(
      { error: "complete_failed", message: error.message },
      { status: 500 },
    );
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "maintenance_history",
    entity_id: (historyId as string) ?? id,
    action: "create",
    after_state: { task_id: id, parts_consumed: b.parts ?? [], comments: b.comments ?? null },
  });

  return NextResponse.json({ ok: true, history_id: historyId });
}
