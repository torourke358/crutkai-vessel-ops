import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// Cash out. A DEPOSIT is simply a payment with no invoice_id — which is
// exactly Craig's case: money paid before anything has been billed.

const bodySchema = z.object({
  estimate_id: z.string().uuid().nullable().optional(),
  invoice_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["deposit", "progress", "final", "refund"]).default("progress"),
  // Non-zero, and negative is legal: that is a refund.
  amount: z.number().refine((n) => n !== 0, "amount must not be zero"),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  method: z.string().trim().max(60).nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
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

  const { data: row, error } = await supabase
    .from("yard_payments")
    .insert({ ...parsed.data, yard_period_id: id, created_by: user.id })
    .select()
    .single();

  if (error || !row) {
    console.error("yard_payments insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id, entity_type: "yard_payment", entity_id: row.id,
    action: "create", after_state: row,
  });
  return NextResponse.json(row, { status: 201 });
}
