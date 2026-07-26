import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// PATCH /api/drydock/plans/[id] — edit plan metadata / finalize.
// DELETE /api/drydock/plans/[id] — remove a plan (cascades to steps).

const patchSchema = z.object({
  area_name: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().max(4000).nullable().optional(),
  yard_period_id: z.string().uuid().nullable().optional(),
  // 'converted' is only ever set by the convert route.
  status: z.enum(["draft", "final"]).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
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

  const { data: before } = await supabase
    .from("disassembly_plans")
    .select()
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: row, error } = await supabase
    .from("disassembly_plans")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error || !row) {
    console.error("disassembly plan update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "disassembly_plan",
    entity_id: id,
    action: "update",
    before_state: before,
    after_state: row,
  });

  return NextResponse.json(row);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase
    .from("disassembly_plans")
    .select()
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await supabase.from("disassembly_plans").delete().eq("id", id);
  if (error) {
    console.error("disassembly plan delete failed", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "disassembly_plan",
    entity_id: id,
    action: "delete",
    before_state: before,
  });

  return NextResponse.json({ ok: true });
}
