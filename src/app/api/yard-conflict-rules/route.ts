import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// The clash rules Craig can edit. The timeline checks these in the browser on
// every drag — instant and free — and the AI review proposes new ones here for
// him to accept, so the list gets smarter without a deploy.

const bodySchema = z.object({
  kind: z.enum(["same_zone", "trade_pair"]),
  trade_a: z.string().trim().max(60).nullable().optional(),
  trade_b: z.string().trim().max(60).nullable().optional(),
  zone_id: z.string().uuid().nullable().optional(),
  severity: z.enum(["warn", "block"]).default("warn"),
  reason: z.string().trim().min(1).max(500),
}).refine(
  (v) => v.kind !== "trade_pair" || (v.trade_a && v.trade_b),
  { message: "A trade pair rule needs both trades.", path: ["trade_b"] },
);

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("yard_conflict_rules").select().eq("active", true).order("created_at");
  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(request: Request) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
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
    .from("yard_conflict_rules")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error || !row) {
    console.error("yard conflict rule insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id, entity_type: "yard_conflict_rule", entity_id: row.id,
    action: "create", after_state: row,
  });
  return NextResponse.json(row, { status: 201 });
}
