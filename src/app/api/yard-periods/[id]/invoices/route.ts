import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// What the vendor has actually billed. Currency is inherited from the
// estimate and never restated here, so a bill cannot drift into a
// different currency from the quote it belongs to.

const bodySchema = z.object({
  estimate_id: z.string().uuid().nullable().optional(),
  reference: z.string().trim().max(100).nullable().optional(),
  amount: z.number().min(0),
  issued_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  document_path: z.string().trim().max(500).nullable().optional(),
  ai_extraction: z.unknown().optional(),
  ai_confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
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
    .from("yard_invoices")
    .insert({ ...parsed.data, yard_period_id: id, created_by: user.id })
    .select()
    .single();

  if (error || !row) {
    console.error("yard_invoices insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id, entity_type: "yard_invoice", entity_id: row.id,
    action: "create", after_state: row,
  });
  return NextResponse.json(row, { status: 201 });
}
