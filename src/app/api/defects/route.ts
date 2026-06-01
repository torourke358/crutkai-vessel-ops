import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).nullable().optional(),
  equipment_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  severity: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  image_path: z.string().trim().max(500).nullable().optional(),
  image_paths: z.array(z.string().trim().max(500)).max(20).optional(),
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
    .from("defects")
    .insert({
      title: b.title,
      description: b.description ?? null,
      equipment_id: b.equipment_id ?? null,
      assigned_to: b.assigned_to ?? null,
      severity: b.severity,
      image_path: b.image_path ?? null,
      image_paths: b.image_paths ?? [],
      reported_by: user.id,
    })
    .select()
    .single();

  if (error || !row) {
    console.error("defects insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "defect",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
