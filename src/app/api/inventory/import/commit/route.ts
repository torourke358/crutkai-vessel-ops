import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAuditMany } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// Craig's real Seahub export was 516 rows, which the old 500 cap rejected
// outright. Raised with headroom — the work below is batched, so the cost is
// row-count / CHUNK round-trips rather than one per row.
const MAX_ROWS = 2000;
const CHUNK = 100;

export const maxDuration = 60;

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
  rows: z.array(rowSchema).min(1).max(MAX_ROWS),
});

type Row = z.infer<typeof rowSchema>;

const toInsert = (r: Row) => ({
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

  const rows = parsed.data.rows;
  let created = 0;
  let failed = 0;
  const inserted: { id: string }[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("inventory_items")
      .insert(chunk.map(toInsert))
      .select();

    if (!error && data) {
      created += data.length;
      inserted.push(...data);
      continue;
    }

    // A chunk insert is all-or-nothing, so one bad row would drop 99 good
    // ones. Fall back to per-row for this chunk only — that keeps the old
    // route's resilience without paying its cost on the happy path.
    console.error("bulk import chunk failed, retrying row-by-row", error);
    for (const r of chunk) {
      const { data: row, error: rowErr } = await supabase
        .from("inventory_items")
        .insert(toInsert(r))
        .select()
        .single();
      if (rowErr || !row) {
        console.error("bulk import row failed", rowErr);
        failed++;
        continue;
      }
      created++;
      inserted.push(row);
    }
  }

  // Audit after the fact, in batches, so the trail is written but never
  // doubles the round-trip cost of the import itself.
  for (let i = 0; i < inserted.length; i += CHUNK) {
    await writeAuditMany(
      inserted.slice(i, i + CHUNK).map((row) => ({
        user_id: user.id,
        entity_type: "inventory_item",
        entity_id: row.id,
        action: "create" as const,
        after_state: row,
      })),
    );
  }

  return NextResponse.json({ created, failed, requested: rows.length });
}
