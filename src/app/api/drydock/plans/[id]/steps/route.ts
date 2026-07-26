import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// PUT /api/drydock/plans/[id]/steps — replace the plan's step list wholesale.
// The editor works on the full ordered list (reorder / edit / delete), so a
// replace keeps seq + depends_on_seqs consistent in one shot.

const stepSchema = z.object({
  seq: z.number().int().min(1).max(500),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).nullable().optional(),
  equipment_label: z.string().trim().max(200).nullable().optional(),
  depends_on_seqs: z.array(z.number().int().min(1)).max(50).default([]),
  is_blocking: z.boolean().default(false),
  external_contractor: z.string().trim().max(200).nullable().optional(),
  contractor_lead_time_days: z.number().int().min(0).max(365).nullable().optional(),
  est_hours: z.number().min(0).max(10000).nullable().optional(),
  flag_reason: z.string().trim().max(1000).nullable().optional(),
});

const bodySchema = z.object({
  steps: z.array(stepSchema).min(1).max(200),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
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

  const { data: plan } = await supabase
    .from("disassembly_plans")
    .select()
    .eq("id", id)
    .single();
  if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (plan.status === "converted") {
    return NextResponse.json({ error: "plan_converted" }, { status: 409 });
  }

  const { data: before } = await supabase
    .from("disassembly_steps")
    .select()
    .eq("plan_id", id)
    .order("seq");

  const { error: delErr } = await supabase
    .from("disassembly_steps")
    .delete()
    .eq("plan_id", id);
  if (delErr) {
    console.error("disassembly steps delete failed", delErr);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  const { data: rows, error: insErr } = await supabase
    .from("disassembly_steps")
    .insert(
      parsed.data.steps.map((s) => ({
        plan_id: id,
        seq: s.seq,
        title: s.title,
        description: s.description ?? null,
        equipment_label: s.equipment_label ?? null,
        depends_on_seqs: s.depends_on_seqs,
        is_blocking: s.is_blocking,
        external_contractor: s.external_contractor ?? null,
        contractor_lead_time_days: s.contractor_lead_time_days ?? null,
        est_hours: s.est_hours ?? null,
        flag_reason: s.flag_reason ?? null,
      })),
    )
    .select();

  if (insErr || !rows) {
    console.error("disassembly steps insert failed", insErr);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "disassembly_plan",
    entity_id: id,
    action: "update",
    before_state: { steps: before ?? [] },
    after_state: { steps: rows },
  });

  return NextResponse.json({ steps: rows });
}
