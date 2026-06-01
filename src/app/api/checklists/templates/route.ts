import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  items: z
    .array(z.object({ body: z.string().trim().min(1).max(500), required: z.boolean().default(true) }))
    .min(1)
    .max(100),
});

export async function POST(request: Request) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
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

  const { data: tpl, error: tErr } = await supabase
    .from("checklist_templates")
    .insert({
      title: b.title,
      description: b.description ?? null,
      category: b.category ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (tErr || !tpl) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  const itemsToInsert = b.items.map((it, i) => ({
    template_id: tpl.id,
    display_order: i * 10,
    body: it.body,
    required: it.required,
  }));
  const { error: iErr } = await supabase
    .from("checklist_template_items")
    .insert(itemsToInsert);

  if (iErr) {
    await supabase.from("checklist_templates").delete().eq("id", tpl.id);
    return NextResponse.json({ error: "items_insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "checklist_template",
    entity_id: tpl.id,
    action: "create",
    after_state: tpl,
  });

  return NextResponse.json(tpl, { status: 201 });
}
