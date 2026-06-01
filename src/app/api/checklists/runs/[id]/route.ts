import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  notes: z.string().trim().max(4000).nullable().optional(),
  complete: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;
  if (parsed.data.complete === true) updates.completed_at = new Date().toISOString();
  if (parsed.data.complete === false) updates.completed_at = null;

  const { data: row, error } = await supabase
    .from("checklist_runs")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "checklist_run",
    entity_id: id,
    action: "update",
    after_state: row,
  });

  return NextResponse.json(row);
}
