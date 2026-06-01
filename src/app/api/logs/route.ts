import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(["crossing", "charter", "guest", "crew", "other"]),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(8000).nullable().optional(),
});

export async function POST(request: Request) {
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
    .from("vessel_logs")
    .insert({
      log_date: b.log_date,
      category: b.category,
      title: b.title,
      body: b.body ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error || !row) {
    console.error("vessel_logs insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "vessel_log",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
