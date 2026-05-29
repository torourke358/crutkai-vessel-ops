import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const bodySchema = z
  .object({
    equipment_id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    priority: z.enum(["low", "moderate", "high", "critical"]).nullable().optional(),
    due_type: z.enum(["calendar", "hours"]),
    interval_days: z.number().int().positive().nullable().optional(),
    interval_hours: z.number().int().positive().nullable().optional(),
    last_done_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    hours_at_last_done: z.number().int().min(0).nullable().optional(),
    assigned_to: z.string().uuid().nullable().optional(),
  })
  .refine(
    (b) =>
      b.due_type === "calendar" ? b.interval_days != null : b.interval_hours != null,
    { message: "interval must match due_type" },
  );

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
    .from("maintenance_tasks")
    .insert({
      equipment_id: b.equipment_id,
      title: b.title,
      description: b.description ?? null,
      priority: b.priority ?? null,
      due_type: b.due_type,
      interval_days: b.due_type === "calendar" ? b.interval_days : null,
      interval_hours: b.due_type === "hours" ? b.interval_hours : null,
      last_done_date: b.last_done_date ?? null,
      hours_at_last_done: b.hours_at_last_done ?? null,
      assigned_to: b.assigned_to ?? null,
    })
    .select()
    .single();

  if (error || !row) {
    console.error("maintenance insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "maintenance_task",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
