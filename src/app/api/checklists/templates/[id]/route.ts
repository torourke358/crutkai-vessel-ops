import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
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
    return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  }

  const { data: before } = await supabase
    .from("checklist_templates")
    .select()
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: after, error } = await supabase
    .from("checklist_templates")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error || !after) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "checklist_template",
    entity_id: id,
    action: "update",
    before_state: before,
    after_state: after,
  });

  return NextResponse.json(after);
}
