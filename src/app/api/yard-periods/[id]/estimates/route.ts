import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// Create an estimate, and optionally the jobs it contains, in one call.
//
// This is the commit step after a photographed estimate has been read and
// checked by a human. The estimate is the spine: one row is both the money
// container and the timeline's phase bar, and its jobs land on the board with
// dates inherited from the estimate's window — so the timeline has something
// to draw the moment the estimate is saved, instead of opening empty.

const jobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  quadrant_id: z.string().uuid().optional(),
  zone_id: z.string().uuid().nullable().optional(),
  trade: z.string().trim().max(60).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  actual_cost: z.number().min(0).nullable().optional(),
});

const bodySchema = z.object({
  vendor_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  reference: z.string().trim().max(100).nullable().optional(),
  amount: z.number().min(0).nullable().optional(),
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD"]).default("USD"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["draft", "approved", "in_progress", "closed", "declined"]).default("draft"),
  document_path: z.string().trim().max(500).nullable().optional(),
  ai_extraction: z.unknown().optional(),
  ai_confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  jobs: z.array(jobSchema).max(200).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { jobs, ...estimate } = parsed.data;

  if (estimate.start_date && estimate.end_date && estimate.end_date < estimate.start_date) {
    return NextResponse.json(
      { error: "validation_failed", issues: { formErrors: ["The estimate can't end before it starts."] } },
      { status: 422 },
    );
  }

  const { data: row, error } = await supabase
    .from("yard_estimates")
    .insert({ ...estimate, yard_period_id: id, created_by: user.id })
    .select()
    .single();

  if (error || !row) {
    console.error("yard estimate insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id, entity_type: "yard_estimate", entity_id: row.id,
    action: "create", after_state: row,
  });

  // Jobs are optional — an estimate can be captured before anyone has decided
  // how to break it up. When they are supplied they need a quadrant, so fall
  // back to the period's first bucket the way the drydock converter does.
  let created = 0;
  if (jobs && jobs.length > 0) {
    const { data: quadrants } = await supabase
      .from("yard_quadrants").select("id, name")
      .eq("yard_period_id", id).order("display_order");
    const fallback = quadrants && quadrants[0] ? quadrants[0].id : null;

    if (!fallback) {
      return NextResponse.json(
        { ...row, created_jobs: 0, warning: "period_has_no_quadrants" },
        { status: 201 },
      );
    }

    const rows = jobs.map((j) => ({
      yard_period_id: id,
      quadrant_id: j.quadrant_id ?? fallback,
      estimate_id: row.id,
      title: j.title,
      description: j.description ?? null,
      zone_id: j.zone_id ?? null,
      trade: j.trade ?? null,
      start_date: j.start_date ?? estimate.start_date ?? null,
      end_date: j.end_date ?? estimate.end_date ?? null,
      actual_cost: j.actual_cost ?? null,
      status: "todo",
      progress_pct: 0,
    }));

    const { data: inserted, error: jobErr } = await supabase
      .from("yard_tasks").insert(rows).select("id");

    if (jobErr) {
      // The estimate is already saved and audited. Report the partial result
      // rather than pretending the whole call failed.
      console.error("yard estimate jobs insert failed", jobErr);
      return NextResponse.json(
        { ...row, created_jobs: 0, warning: "jobs_insert_failed" },
        { status: 201 },
      );
    }
    created = inserted ? inserted.length : 0;
  }

  return NextResponse.json({ ...row, created_jobs: created }, { status: 201 });
}
