import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const bodySchema = z.object({
  part_name: z.string().trim().min(1).max(200),
  part_number: z.string().trim().max(100).nullable().optional(),
  make: z.string().trim().max(100).nullable().optional(),
  quantity: z.number().int().min(0),
  unit: z.string().trim().max(40).default("Units"),
  location: z.string().trim().max(200).nullable().optional(),
  related_component_id: z.string().uuid().nullable().optional(),
  critical_threshold: z.number().int().min(0).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(request: Request) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const b = parsed.data;

  const { data: row, error } = await supabase
    .from("inventory_items")
    .insert({
      part_name: b.part_name,
      part_number: b.part_number ?? null,
      make: b.make ?? null,
      quantity: b.quantity,
      unit: b.unit,
      location: b.location ?? null,
      related_component_id: b.related_component_id ?? null,
      critical_threshold: b.critical_threshold ?? null,
      notes: b.notes ?? null,
    })
    .select()
    .single();

  if (error || !row) {
    console.error("inventory insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "inventory_item",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
