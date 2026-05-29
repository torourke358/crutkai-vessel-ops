import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  make: z.string().trim().max(100).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  serial: z.string().trim().max(100).nullable().optional(),
  location_on_vessel: z.string().trim().max(200).nullable().optional(),
  current_hours: z.number().int().min(0).nullable().optional(),
  component_id: z.string().uuid().nullable().optional(),
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const b = parsed.data;

  const { data: row, error } = await supabase
    .from("equipment")
    .insert({
      name: b.name,
      make: b.make ?? null,
      model: b.model ?? null,
      serial: b.serial ?? null,
      location_on_vessel: b.location_on_vessel ?? null,
      current_hours: b.current_hours ?? null,
      component_id: b.component_id ?? null,
      notes: b.notes ?? null,
    })
    .select()
    .single();

  if (error || !row) {
    console.error("equipment insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "equipment",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
