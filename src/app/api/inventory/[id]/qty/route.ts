import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  quantity: z.number().int().min(0),
});

type Ctx = { params: Promise<{ id: string }> };

// POST /api/inventory/[id]/qty — any signed-in user (incl. crew) can adjust
// a single item's quantity inline from the list. Routes through the same
// inv_apply_quantity_change SQL function so crossing-detection still fires
// and the threshold-alert email is enqueued. Service-role used for the RPC
// call so RLS doesn't trip on the function's internal updates.
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

  const { data: before } = await supabase
    .from("inventory_items")
    .select()
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const delta = parsed.data.quantity - before.quantity;
  if (delta === 0) return NextResponse.json(before);

  // RPC for atomic decrement + crossing detection. Using service role here so
  // the function's nested UPDATE on inventory_items bypasses RLS — crew RLS
  // on inventory writes is intentionally narrow.
  const admin = createServiceClient();
  const { error: rpcErr } = await admin.rpc("inv_apply_quantity_change", {
    p_item_id: id,
    p_delta: delta,
    p_actor: user.id,
  });
  if (rpcErr) {
    console.error("inv_apply_quantity_change failed", rpcErr);
    return NextResponse.json({ error: "update_failed", detail: rpcErr.message }, { status: 500 });
  }

  const { data: after } = await supabase
    .from("inventory_items")
    .select()
    .eq("id", id)
    .single();

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
