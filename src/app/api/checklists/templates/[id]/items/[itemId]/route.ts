import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const patchSchema = z.object({
  body: z.string().trim().min(1).max(500).optional(),
  display_order: z.number().int().min(0).max(10000).optional(),
  required: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { itemId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  }

  const { data: before } = await supabase
    .from("checklist_template_items")
    .select()
    .eq("id", itemId)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: after, error } = await supabase
    .from("checklist_template_items")
    .update(parsed.data)
    .eq("id", itemId)
    .select()
    .maybeSingle();

  if (error || !after) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "checklist_template_item",
    entity_id: itemId,
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
  const { itemId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase
    .from("checklist_template_items")
    .select()
    .eq("id", itemId)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await supabase
    .from("checklist_template_items")
    .delete()
    .eq("id", itemId);

  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  await writeAudit({
    user_id: user.id,
    entity_type: "checklist_template_item",
    entity_id: itemId,
    action: "delete",
    before_state: before,
  });

  return NextResponse.json({ ok: true });
}
