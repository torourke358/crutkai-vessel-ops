import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// Cell-editable spreadsheet → batched PATCH. Each row's update is keyed by
// `id` and contains only the fields that changed.
const rowPatch = z.object({
  id: z.string().uuid(),
  part_name: z.string().trim().min(1).max(200).optional(),
  part_number: z.string().trim().max(100).nullable().optional(),
  make: z.string().trim().max(100).nullable().optional(),
  quantity: z.number().int().min(0).optional(),
  unit: z.string().trim().max(40).optional(),
  location: z.string().trim().max(200).nullable().optional(),
  related_component_id: z.string().uuid().nullable().optional(),
  critical_threshold: z.number().int().min(0).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const bodySchema = z.object({
  updates: z.array(rowPatch).min(1).max(500),
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

  let updated = 0;
  let failed = 0;
  const failures: { id: string; reason: string }[] = [];

  for (const u of parsed.data.updates) {
    const { id, ...fields } = u;
    if (Object.keys(fields).length === 0) continue;

    const { data: before } = await supabase
      .from("inventory_items")
      .select()
      .eq("id", id)
      .single();
    if (!before) {
      failed++;
      failures.push({ id, reason: "not_found" });
      continue;
    }

    const { data: after, error, count } = await supabase
      .from("inventory_items")
      .update(fields, { count: "exact" })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      failed++;
      failures.push({ id, reason: error.message });
      continue;
    }
    if (!count || !after) {
      failed++;
      failures.push({ id, reason: "forbidden" });
      continue;
    }

    updated++;
    await writeAudit({
      user_id: user.id,
      entity_type: "inventory_item",
      entity_id: id,
      action: "update",
      before_state: before,
      after_state: after,
    });
  }

  return NextResponse.json({
    updated,
    failed,
    requested: parsed.data.updates.length,
    failures: failures.slice(0, 20),
  });
}
