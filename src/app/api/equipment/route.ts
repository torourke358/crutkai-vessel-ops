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
  commissioned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  image_paths: z.array(z.string().trim().max(500)).max(20).optional(),
  critical: z.boolean().optional(),
  is_ism: z.boolean().optional(),
  is_isps: z.boolean().optional(),
  ga_x: z.number().min(0).max(100).nullable().optional(),
  ga_y: z.number().min(0).max(100).nullable().optional(),
  zone_id: z.string().uuid().nullable().optional(),
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
      commissioned_date: b.commissioned_date ?? null,
      image_paths: b.image_paths ?? [],
      critical: b.critical ?? false,
      is_ism: b.is_ism ?? false,
      is_isps: b.is_isps ?? false,
      ga_x: b.ga_x ?? null,
      ga_y: b.ga_y ?? null,
      zone_id: b.zone_id ?? null,
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
