import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// Vendors are vessel-wide, not per-period: Roscioli comes back. Before this
// table existed a contractor was free text in yard_tasks.resources.

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  trade: z.string().trim().max(60).nullable().optional(),
  contact: z.string().trim().max(400).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("yard_vendors").select().eq("active", true).order("name");
  return NextResponse.json({ vendors: data ?? [] });
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
    .from("yard_vendors")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error || !row) {
    // Unique index on lower(name) — say so plainly rather than a generic 500.
    if (error?.code === "23505") {
      return NextResponse.json({ error: "vendor_exists" }, { status: 409 });
    }
    console.error("yard vendor insert failed", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id, entity_type: "yard_vendor", entity_id: row.id,
    action: "create", after_state: row,
  });
  return NextResponse.json(row, { status: 201 });
}
