import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const bodySchema = z.object({
  kind: z.enum(["quotation", "invoice", "spec", "image", "other"]),
  file_name: z.string().trim().min(1).max(255),
  file_path: z.string().trim().min(1).max(500),
  file_size: z.number().int().min(0).nullable().optional(),
  mime_type: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

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
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const b = parsed.data;

  const { data: row, error } = await supabase
    .from("inventory_documents")
    .insert({
      inventory_item_id: id,
      kind: b.kind,
      file_name: b.file_name,
      file_path: b.file_path,
      file_size: b.file_size ?? null,
      mime_type: b.mime_type ?? null,
      notes: b.notes ?? null,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error || !row) {
    console.error("inventory_documents insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "inventory_document",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
