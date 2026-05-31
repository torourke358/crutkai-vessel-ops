import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

// POST /api/components — any signed-in user can add a new component type.
// Defaults active=true, derives a code slug from the name. If a component
// with the same name already exists (case-insensitive), returns that row
// instead of creating a duplicate.
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
  const name = parsed.data.name;
  const code = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || `comp_${Date.now()}`;

  // Try to find an existing match (case-insensitive) first so the picker
  // doesn't pile up "AC" / "ac" / "Ac" duplicates if multiple users add
  // the same thing at once.
  const { data: existing } = await supabase
    .from("components")
    .select()
    .ilike("name", name)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(existing);
  }

  // Pick a display_order higher than any existing component so new ones
  // append to the bottom of pickers / chip rows.
  const { data: maxRow } = await supabase
    .from("components")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = (maxRow?.display_order ?? 0) + 10;

  const { data: row, error } = await supabase
    .from("components")
    .insert({ name, code, display_order, active: true })
    .select()
    .single();

  if (error || !row) {
    console.error("component insert failed", error);
    return NextResponse.json({ error: "insert_failed", detail: error?.message }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "component",
    entity_id: row.id,
    action: "create",
    after_state: row,
  });

  return NextResponse.json(row, { status: 201 });
}
