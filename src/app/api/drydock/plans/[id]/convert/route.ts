import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";
import type { DisassemblyStep, YardQuadrant } from "@/lib/types";

// POST /api/drydock/plans/[id]/convert — turn a finished plan into yard
// tasks: one yard_task per step in the chosen yard period (Engineering
// quadrant by default), title prefixed with the seq number, notes carrying
// the dependency chain + contractor flags. Marks the plan 'converted'.

const bodySchema = z.object({
  yard_period_id: z.string().uuid(),
});

type Ctx = { params: Promise<{ id: string }> };

function stepNotes(s: DisassemblyStep): string {
  const parts: string[] = [];
  if (s.description) parts.push(s.description);
  if (s.equipment_label) parts.push(`Equipment: ${s.equipment_label}`);
  if (s.depends_on_seqs.length > 0) {
    parts.push(`Depends on step(s): ${s.depends_on_seqs.map((d) => `#${d}`).join(", ")}`);
  }
  if (s.is_blocking) {
    const lead =
      s.contractor_lead_time_days != null
        ? ` (~${s.contractor_lead_time_days} day lead time)`
        : "";
    parts.push(
      `BLOCKING — ${s.external_contractor ? `book ${s.external_contractor} contractor${lead} before work begins` : `must be scheduled before work begins${lead}`}.`,
    );
  }
  if (s.flag_reason) parts.push(`Flag: ${s.flag_reason}`);
  if (s.est_hours != null) parts.push(`Est. ${s.est_hours}h`);
  return parts.join("\n");
}

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
  const { yard_period_id } = parsed.data;

  const { data: plan } = await supabase
    .from("disassembly_plans")
    .select()
    .eq("id", id)
    .single();
  if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (plan.status === "converted") {
    return NextResponse.json({ error: "already_converted" }, { status: 409 });
  }

  const [{ data: steps }, { data: quadrants }] = await Promise.all([
    supabase
      .from("disassembly_steps")
      .select()
      .eq("plan_id", id)
      .order("seq")
      .returns<DisassemblyStep[]>(),
    supabase
      .from("yard_quadrants")
      .select()
      .eq("yard_period_id", yard_period_id)
      .order("display_order")
      .returns<YardQuadrant[]>(),
  ]);

  if (!steps || steps.length === 0) {
    return NextResponse.json({ error: "no_steps" }, { status: 400 });
  }
  if (!quadrants || quadrants.length === 0) {
    return NextResponse.json({ error: "period_has_no_quadrants" }, { status: 400 });
  }
  const quadrant =
    quadrants.find((q) => q.name.trim().toLowerCase() === "engineering") ?? quadrants[0];

  let created = 0;
  let failed = 0;
  for (const s of steps) {
    const { data: row, error } = await supabase
      .from("yard_tasks")
      .insert({
        yard_period_id,
        quadrant_id: quadrant.id,
        title: `${s.seq}. ${plan.area_name}: ${s.title}`.slice(0, 200),
        description: stepNotes(s) || null,
        status: "todo",
        progress_pct: 0,
        // Contractor blockers are the fires — everything else is important
        // but not urgent yet.
        urgency: s.is_blocking ? "fires" : "prioritize",
      })
      .select()
      .single();
    if (error || !row) {
      console.error("convert step → yard task failed", { step: s.id, error });
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

  const { data: after, error: updErr } = await supabase
    .from("disassembly_plans")
    .update({ status: "converted", yard_period_id })
    .eq("id", id)
    .select()
    .single();

  if (updErr || !after) {
    console.error("plan convert status update failed", updErr);
    return NextResponse.json({ error: "update_failed", created, failed }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "disassembly_plan",
    entity_id: id,
    action: "update",
    before_state: plan,
    after_state: after,
  });

  return NextResponse.json({ created, failed, yard_period_id, quadrant_id: quadrant.id });
}
