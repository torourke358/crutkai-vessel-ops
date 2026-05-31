import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const patchSchema = z.object({
  part_name: z.string().trim().min(1).max(200).optional(),
  part_number: z.string().trim().max(100).nullable().optional(),
  make: z.string().trim().max(100).nullable().optional(),
  quantity: z.number().int().min(0).optional(),
  unit: z.string().trim().max(40).optional(),
  location: z.string().trim().max(200).nullable().optional(),
  component_ids: z.array(z.string().uuid()).max(8).optional(),
  location_photo_path: z.string().max(500).nullable().optional(),
  critical_threshold: z.number().int().min(0).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
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

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { data: before } = await supabase
    .from("inventory_items")
    .select()
    .eq("id", id)
    .single();
  if (!before) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: after, error, count } = await supabase
    .from("inventory_items")
    .update(parsed.data, { count: "exact" })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("inventory update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!count || !after) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "inventory_item",
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
    .from("inventory_items")
    .select()
    .eq("id", id)
    .single();
  if (!before) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error, count } = await supabase
    .from("inventory_items")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("inventory delete failed", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "inventory_item",
    entity_id: id,
    action: "delete",
    before_state: before,
  });

  return NextResponse.json({ ok: true });
}
