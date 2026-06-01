import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const bodySchema = z.object({
  body: z.string().trim().min(1).max(500),
  required: z.boolean().default(true),
});

type Ctx = { params: Promise<{ id: string }> };

// POST /api/checklists/templates/[id]/items — admin appends an item to a
// template. Existing runs are unaffected (they reference a copy via
// checklist_run_items so the template can keep evolving).
export async function POST(request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  }

  const { data: maxRow } = await supabase
    .from("checklist_template_items")
    .select("display_order")
    .eq("template_id", id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? 0) + 10;

  const { data: row, error } = await supabase
    .from("checklist_template_items")
    .insert({ template_id: id, display_order, body: parsed.data.body, required: parsed.data.required })
    .select()
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "checklist_template_item",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
