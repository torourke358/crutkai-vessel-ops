import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// Each preview row knows its equipment by NAME (not by id). The commit
// endpoint auto-creates equipment that doesn't already exist (per Tim's Q5),
// then inserts the matching maintenance_task.
const rowSchema = z.object({
  title: z.string().trim().min(1).max(200),
  equipment_name: z.string().trim().min(1).max(200),
  system_id: z.string().uuid().nullable().optional(), // mapped from components on the client
  priority: z.enum(["low", "moderate", "high", "critical"]).nullable().optional(),
  due_type: z.enum(["calendar", "hours"]),
  interval_days: z.number().int().positive().nullable().optional(),
  interval_hours: z.number().int().positive().nullable().optional(),
  last_done_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  hours_at_last_done: z.number().int().min(0).nullable().optional(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
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

  // Cache existing equipment so we only create what's actually new.
  const { data: existingEquipment } = await supabase
    .from("equipment")
    .select("id, name, component_id");
  const eqByName = new Map<string, { id: string; component_id: string | null }>();
  for (const e of existingEquipment ?? []) {
    eqByName.set(e.name.toLowerCase().trim(), {
      id: e.id,
      component_id: e.component_id,
    });
  }

  let equipmentCreated = 0;
  let tasksCreated = 0;
  let failed = 0;
  const failures: { row: number; reason: string }[] = [];

  let i = 0;
  for (const r of parsed.data.rows) {
    i++;
    const key = r.equipment_name.toLowerCase().trim();
    let equipmentId = eqByName.get(key)?.id;

    // Auto-create equipment when the task references a name we don't have yet.
    if (!equipmentId) {
      const { data: created, error: createErr } = await supabase
        .from("equipment")
        .insert({
          name: r.equipment_name,
          component_id: r.system_id ?? null,
        })
        .select("id, component_id")
        .single();
      if (createErr || !created) {
        failed++;
        failures.push({ row: i, reason: `equipment create failed: ${createErr?.message ?? "unknown"}` });
        continue;
      }
      equipmentId = created.id;
      eqByName.set(key, { id: created.id, component_id: created.component_id });
      equipmentCreated++;
      await writeAudit({
        user_id: user.id,
        entity_type: "equipment",
        entity_id: created.id,
        action: "create",
        after_state: { name: r.equipment_name, component_id: r.system_id ?? null },
      });
    }

    // Now insert the maintenance task.
    const { data: task, error: taskErr } = await supabase
      .from("maintenance_tasks")
      .insert({
        equipment_id: equipmentId,
        title: r.title,
        priority: r.priority ?? null,
        due_type: r.due_type,
        interval_days: r.due_type === "calendar" ? r.interval_days ?? null : null,
        interval_hours: r.due_type === "hours" ? r.interval_hours ?? null : null,
        last_done_date: r.last_done_date ?? null,
        hours_at_last_done: r.hours_at_last_done ?? null,
      })
      .select()
      .single();

    if (taskErr || !task) {
      failed++;
      failures.push({ row: i, reason: `task create failed: ${taskErr?.message ?? "unknown"}` });
      continue;
    }
    tasksCreated++;
    await writeAudit({
      user_id: user.id,
      entity_type: "maintenance_task",
      entity_id: task.id,
      action: "create",
      after_state: task,
    });
  }

  return NextResponse.json({
    requested: parsed.data.rows.length,
    equipment_created: equipmentCreated,
    tasks_created: tasksCreated,
    failed,
    failures: failures.slice(0, 20),
  });
}
