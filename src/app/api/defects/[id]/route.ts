import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(8000).nullable().optional(),
  equipment_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  status: z.enum(["open", "in_progress", "resolved"]).optional(),
  severity: z.enum(["low", "normal", "high", "critical"]).optional(),
  resolution: z.string().trim().max(4000).nullable().optional(),
  image_path: z.string().trim().max(500).nullable().optional(),
  image_paths: z.array(z.string().trim().max(500)).max(20).optional(),
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
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { data: before } = await supabase.from("defects").select().eq("id", id).single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // If we're flipping to resolved, stamp the resolved_at/by columns.
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "resolved" && before.status !== "resolved") {
    updates.resolved_at = new Date().toISOString();
    updates.resolved_by = user.id;
  } else if (parsed.data.status && parsed.data.status !== "resolved") {
    updates.resolved_at = null;
    updates.resolved_by = null;
  }

  const { data: after, error } = await supabase
    .from("defects")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error || !after) {
    console.error("defects update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "defect",
    entity_id: id,
    action: "update",
    before_state: before,
    after_state: after,
  });

  return NextResponse.json(after);
}
