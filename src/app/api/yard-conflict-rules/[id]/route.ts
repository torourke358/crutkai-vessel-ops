import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// Rules are deactivated, never deleted: a rule that once flagged a clash is
// part of why the schedule looks the way it does.
export async function DELETE(_request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase
    .from("yard_conflict_rules").select().eq("id", id).single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: after, error } = await supabase
    .from("yard_conflict_rules").update({ active: false }).eq("id", id).select().single();
  if (error || !after) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  await writeAudit({
    user_id: user.id, entity_type: "yard_conflict_rule", entity_id: id,
    action: "update", before_state: before, after_state: after,
  });
  return NextResponse.json({ ok: true });
}
