import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  display_order: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/components/[id] — admin can rename, reorder, or activate /
// deactivate a system. Crew can already create via POST, but mutating an
// existing row is admin-only.
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
    .from("components")
    .select()
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: after, error, count } = await supabase
    .from("components")
    .update(parsed.data, { count: "exact" })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("component update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!count || !after) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "component",
    entity_id: id,
    action: "update",
    before_state: before,
    after_state: after,
  });

  return NextResponse.json(after);
}
