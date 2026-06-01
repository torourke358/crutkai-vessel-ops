import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(_request: Request, ctx: Ctx) {
  const { docId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase
    .from("yard_task_documents")
    .select()
    .eq("id", docId)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // RLS limits delete to uploader or admin; count check turns RLS-denied into
  // a clean 403.
  const { error, count } = await supabase
    .from("yard_task_documents")
    .delete({ count: "exact" })
    .eq("id", docId);

  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  if (!count) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await supabase.storage.from("yard-task-documents").remove([before.file_path]);

  await writeAudit({
    user_id: user.id,
    entity_type: "yard_task_document",
    entity_id: docId,
    action: "delete",
    before_state: before,
  });

  return NextResponse.json({ ok: true });
}
