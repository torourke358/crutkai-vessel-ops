import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  template_id: z.string().uuid(),
});

// POST /api/checklists/runs — start a new run for a template. Snapshots
// the template's items into checklist_run_items so the run is immutable
// against later template edits.
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
  const { template_id } = parsed.data;

  const { data: items } = await supabase
    .from("checklist_template_items")
    .select("id")
    .eq("template_id", template_id);
  if (!items || items.length === 0) {
    return NextResponse.json({ error: "template_has_no_items" }, { status: 422 });
  }

  const { data: run, error: rErr } = await supabase
    .from("checklist_runs")
    .insert({ template_id, started_by: user.id })
    .select()
    .single();
  if (rErr || !run) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  const runItems = items.map((it) => ({ run_id: run.id, template_item_id: it.id }));
  const { error: iErr } = await supabase.from("checklist_run_items").insert(runItems);
  if (iErr) {
    await supabase.from("checklist_runs").delete().eq("id", run.id);
    return NextResponse.json({ error: "items_insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "checklist_run",
    entity_id: run.id,
    action: "create",
    after_state: run,
  });

  return NextResponse.json(run, { status: 201 });
}
