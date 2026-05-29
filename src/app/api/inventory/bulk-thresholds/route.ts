import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// Up to 500 items per call — generous ceiling vs the ~300-row Seahub import.
const bodySchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        critical_threshold: z.number().int().min(0).nullable(),
      }),
    )
    .min(1)
    .max(500),
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

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Per-row update so the BEFORE/AFTER triggers fire cleanly. Sequential
  // is fine for ~300 rows; if it ever gets slow we'll batch via SQL VALUES.
  let updated = 0;
  for (const u of parsed.data.updates) {
    const { data: row, error } = await supabase
      .from("inventory_items")
      .update({ critical_threshold: u.critical_threshold }, { count: "exact" })
      .eq("id", u.id)
      .select()
      .maybeSingle();
    if (error) {
      console.error("bulk threshold row failed", { id: u.id, error });
      continue;
    }
    if (row) {
      updated += 1;
      await writeAudit({
        user_id: user.id,
        entity_type: "inventory_item",
        entity_id: u.id,
        action: "update",
        after_state: { critical_threshold: u.critical_threshold },
      });
    }
  }

  return NextResponse.json({ updated, requested: parsed.data.updates.length });
}
