import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

// Bulk hours update — typically a daily/weekly engineer routine where they
// walk the engine room reading every meter. Any signed-in user can record
// readings (same authority as the per-equipment hour reading endpoint).
const bodySchema = z.object({
  updates: z
    .array(
      z.object({
        equipment_id: z.string().uuid(),
        hours: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(200),
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

  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const failures: { id: string; reason: string }[] = [];

  for (const u of parsed.data.updates) {
    const { data: before } = await supabase
      .from("equipment")
      .select("id, current_hours, name")
      .eq("id", u.equipment_id)
      .single();
    if (!before) {
      failed++;
      failures.push({ id: u.equipment_id, reason: "not_found" });
      continue;
    }

    // Refuse a regression below the current reading (engine meters don't go
    // backwards). Same guard as the single-equipment endpoint.
    if (before.current_hours != null && u.hours < before.current_hours) {
      failed++;
      failures.push({
        id: u.equipment_id,
        reason: `hours regression: ${u.hours} < current ${before.current_hours}`,
      });
      continue;
    }

    if (before.current_hours === u.hours) {
      unchanged++;
      continue;
    }

    const { error } = await supabase
      .from("equipment")
      .update({ current_hours: u.hours }, { count: "exact" })
      .eq("id", u.equipment_id);

    if (error) {
      failed++;
      failures.push({ id: u.equipment_id, reason: error.message });
      continue;
    }
    updated++;
    await writeAudit({
      user_id: user.id,
      entity_type: "equipment_hour_reading",
      entity_id: u.equipment_id,
      action: "create",
      after_state: { hours: u.hours, equipment_id: u.equipment_id },
    });
  }

  return NextResponse.json({
    updated,
    unchanged,
    failed,
    requested: parsed.data.updates.length,
    failures: failures.slice(0, 50),
  });
}
