import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  checked: z.boolean(),
  note: z.string().trim().max(2000).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { itemId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  }

  const updates: Record<string, unknown> = {
    checked: parsed.data.checked,
    note: parsed.data.note ?? null,
  };
  if (parsed.data.checked) {
    updates.checked_at = new Date().toISOString();
    updates.checked_by = user.id;
  } else {
    updates.checked_at = null;
    updates.checked_by = null;
  }

  const { data: row, error } = await supabase
    .from("checklist_run_items")
    .update(updates)
    .eq("id", itemId)
    .select()
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json(row);
}
