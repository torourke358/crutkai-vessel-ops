import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  actual_cost: z.number().min(0).nullable().optional(),
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

type Ctx = { params: Promise<{ id: string; taskId: string }> };

// Mark a yard task done. Optionally records final actual_cost and consumes
// parts from inventory. Crew owner or admin can complete.
export async function POST(request: Request, ctx: Ctx) {
  const { taskId } = await ctx.params;
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

  const update: Record<string, unknown> = {
    status: "done",
    progress_pct: 100,
    completed_at: new Date().toISOString(),
    completed_by: user.id,
  };
  if (b.actual_cost !== undefined) update.actual_cost = b.actual_cost;

  const { data: after, error, count } = await supabase
    .from("yard_tasks")
    .update(update, { count: "exact" })
    .eq("id", taskId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  if (!count || !after) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Consume parts (each insert fires pc_after_insert trigger; alert state
  // recomputed by inv triggers from 02 migration).
  for (const p of b.parts ?? []) {
    const { error: pcErr } = await supabase.from("parts_consumed").insert({
      source_type: "yard",
      source_id: taskId,
      inventory_item_id: p.inventory_item_id,
      qty_used: p.qty_used,
      recorded_by: user.id,
    });
    if (pcErr) {
      console.error("parts_consumed insert failed", pcErr);
    }
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "yard_task",
    entity_id: taskId,
    action: "update",
    after_state: after,
  });

  return NextResponse.json(after);
}
