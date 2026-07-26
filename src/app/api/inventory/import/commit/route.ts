import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

const rowSchema = z.object({
  part_name: z.string().trim().min(1).max(200),
  part_number: z.string().trim().max(100).nullable().optional(),
  make: z.string().trim().max(100).nullable().optional(),
  quantity: z.number().int().min(0),
  unit: z.string().trim().max(40).default("Units"),
  location: z.string().trim().max(200).nullable().optional(),
  component_ids: z.array(z.string().uuid()).max(8).optional(),
  critical_threshold: z.number().int().min(0).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  // Optional — sent by the spreadsheet import; the PDF flow omits them.
  unit_price: z.number().min(0).nullable().optional(),
  supplier: z.string().trim().max(200).nullable().optional(),
});

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
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

  // Bulk insert. Audit per row so we can replay.
  let created = 0;
  let failed = 0;
  for (const r of parsed.data.rows) {
    const { data: row, error } = await supabase
      .from("inventory_items")
      .insert({
        part_name: r.part_name,
        part_number: r.part_number ?? null,
        make: r.make ?? null,
        quantity: r.quantity,
        unit: r.unit,
        location: r.location ?? null,
        component_ids: r.component_ids ?? [],
        critical_threshold: r.critical_threshold ?? null,
        notes: r.notes ?? null,
        unit_price: r.unit_price ?? null,
        supplier: r.supplier ?? null,
      })
      .select()
      .single();
    if (error || !row) {
      console.error("bulk import row failed", error);
      failed++;
      continue;
    }
    created++;
    await writeAudit({
      user_id: user.id,
      entity_type: "inventory_item",
      entity_id: row.id,
      action: "create",
      after_state: row,
    });
  }

  return NextResponse.json({ created, failed, requested: parsed.data.rows.length });
}
