import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";
import type { YardQuadrant } from "@/lib/types";

// POST /api/yard-periods/import — step 2 of the prior-yard-period import.
// Creates the yard_period (status 'closed' by default — these are historical
// records) and bulk-inserts one yard_task per verified row. The DB trigger
// seeds the four default quadrants on period insert; each row's "area" is
// matched against those by name, falling back to Engineering.

const rowSchema = z.object({
  title: z.string().trim().min(1).max(200),
  area: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  cost: z.number().min(0).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["planned", "active", "closed"]).default("closed"),
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
  const { name, start_date, end_date, status, rows } = parsed.data;

  const { data: period, error: periodErr } = await supabase
    .from("yard_periods")
    .insert({ name, start_date, end_date: end_date ?? null, status })
    .select()
    .single();

  if (periodErr || !period) {
    console.error("yard period import insert failed", periodErr);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "yard_period",
    entity_id: period.id,
    action: "create",
    after_state: period,
  });

  // The seed_default_quadrants trigger has already run — fetch what it made.
  const { data: quadrants } = await supabase
    .from("yard_quadrants")
    .select()
    .eq("yard_period_id", period.id)
    .order("display_order")
    .returns<YardQuadrant[]>();

  if (!quadrants || quadrants.length === 0) {
    return NextResponse.json({ error: "period_has_no_quadrants" }, { status: 500 });
  }

  const byName = new Map(quadrants.map((q) => [q.name.trim().toLowerCase(), q]));
  const fallback =
    byName.get("engineering") ?? quadrants[0];

  let created = 0;
  let failed = 0;
  for (const r of rows) {
    const quadrant = (r.area && byName.get(r.area.trim().toLowerCase())) || fallback;
    const { data: row, error } = await supabase
      .from("yard_tasks")
      .insert({
        yard_period_id: period.id,
        quadrant_id: quadrant.id,
        title: r.title,
        description: r.notes ?? null,
        due_date: r.due_date ?? null,
        actual_cost: r.cost ?? null,
        // Historical periods import as finished work.
        status: status === "closed" ? "done" : "todo",
        progress_pct: status === "closed" ? 100 : 0,
      })
      .select()
      .single();
    if (error || !row) {
      console.error("yard task import row failed", error);
      failed++;
      continue;
    }
    created++;
    await writeAudit({
      user_id: user.id,
      entity_type: "yard_task",
      entity_id: row.id,
      action: "create",
      after_state: row,
    });
  }

  return NextResponse.json(
    { period_id: period.id, created, failed, requested: rows.length },
    { status: 201 },
  );
}
