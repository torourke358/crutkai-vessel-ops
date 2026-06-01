import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { docId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase
    .from("inventory_documents")
    .select()
    .eq("id", docId)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error, count } = await supabase
    .from("inventory_documents")
    .delete({ count: "exact" })
    .eq("id", docId);

  if (error) {
    console.error("inventory_documents delete failed", error);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  if (!count) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await supabase.storage.from("inventory-documents").remove([before.file_path]);

  await writeAudit({
    user_id: user.id,
    entity_type: "inventory_document",
    entity_id: docId,
    action: "delete",
    before_state: before,
  });

  return NextResponse.json({ ok: true });
}
