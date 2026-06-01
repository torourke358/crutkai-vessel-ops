import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  file_path: z.string().trim().min(1).max(500),
  file_size: z.number().int().min(0).nullable().optional(),
  mime_type: z.string().trim().max(100).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
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
  const b = parsed.data;

  const { data: row, error } = await supabase
    .from("yard_task_documents")
    .insert({
      yard_task_id: id,
      file_name: b.file_name,
      file_path: b.file_path,
      file_size: b.file_size ?? null,
      mime_type: b.mime_type ?? null,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error || !row) {
    console.error("yard_task_documents insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "yard_task_document",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
