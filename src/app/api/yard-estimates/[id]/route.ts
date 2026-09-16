import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const patchSchema = z.object({
  vendor_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  amount: z.number().min(0).nullable().optional(),
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD"]).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["draft", "approved", "in_progress", "closed", "declined"]).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { data: before } = await supabase.from("yard_estimates").select().eq("id", id).single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Compare against what the row will BE, not what was sent — editing one end
  // of the window only patches one of the two dates.
  const nextStart = parsed.data.start_date !== undefined ? parsed.data.start_date : before.start_date;
  const nextEnd = parsed.data.end_date !== undefined ? parsed.data.end_date : before.end_date;
  if (nextStart && nextEnd && nextEnd < nextStart) {
    return NextResponse.json(
      { error: "validation_failed", issues: { formErrors: ["The estimate can't end before it starts."] } },
      { status: 422 },
    );
  }

  const { data: after, error } = await supabase
    .from("yard_estimates").update(parsed.data).eq("id", id).select().single();
  if (error || !after) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  await writeAudit({
    user_id: user.id, entity_type: "yard_estimate", entity_id: id,
    action: "update", before_state: before, after_state: after,
  });
  return NextResponse.json(after);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: before } = await supabase.from("yard_estimates").select().eq("id", id).single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Money already booked against this estimate must not silently vanish with
  // it. Invoices and payments are FK'd ON DELETE SET NULL, so deleting would
  // orphan real cash into the "Unassigned" bucket instead of failing loudly.
  const [{ count: invCount }, { count: payCount }] = await Promise.all([
    supabase.from("yard_invoices").select("id", { count: "exact", head: true }).eq("estimate_id", id),
    supabase.from("yard_payments").select("id", { count: "exact", head: true }).eq("estimate_id", id),
  ]);
  if ((invCount ?? 0) > 0 || (payCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "estimate_has_money", invoices: invCount ?? 0, payments: payCount ?? 0 },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("yard_estimates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });

  await writeAudit({
    user_id: user.id, entity_type: "yard_estimate", entity_id: id,
    action: "delete", before_state: before,
  });
  return NextResponse.json({ ok: true });
}
