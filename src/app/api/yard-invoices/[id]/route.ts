import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase.from("yard_invoices").select().eq("id", id).single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await supabase.from("yard_invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  await writeAudit({
    user_id: user.id, entity_type: "yard_invoice", entity_id: id,
    action: "delete", before_state: before,
  });
  return NextResponse.json({ ok: true });
}
