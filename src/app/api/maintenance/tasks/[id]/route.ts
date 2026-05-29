import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(["low", "moderate", "high", "critical"]).nullable().optional(),
  interval_days: z.number().int().positive().nullable().optional(),
  interval_hours: z.number().int().positive().nullable().optional(),
  last_done_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  hours_at_last_done: z.number().int().min(0).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
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
    .from("maintenance_tasks")
    .select()
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: after, error, count } = await supabase
    .from("maintenance_tasks")
    .update(parsed.data, { count: "exact" })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("maintenance update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!count || !after) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "maintenance_task",
    entity_id: id,
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
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase
    .from("maintenance_tasks")
    .select()
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error, count } = await supabase
    .from("maintenance_tasks")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("maintenance delete failed", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "maintenance_task",
    entity_id: id,
    action: "delete",
    before_state: before,
  });

  return NextResponse.json({ ok: true });
}
