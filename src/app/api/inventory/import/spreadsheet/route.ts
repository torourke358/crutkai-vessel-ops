import { NextResponse } from "next/server";
import { getUserRole } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import {
  mapColumns,
  parseIntLoose,
  parseMoneyLoose,
  parseXlsx,
} from "@/lib/spreadsheet";

// POST /api/inventory/import/spreadsheet — third import source alongside the
// PDF/photo extractor. Accepts a CSV or XLSX upload (multipart form-data,
// field "file"), heuristically maps the header row to inventory fields, and
// returns rows in the SAME shape as /api/inventory/import/pdf so the existing
// preview → commit flow is reused unchanged (plus unit_price / supplier,
// which spreadsheets often carry and the commit route accepts).

// Field resolution order matters: specific headers ("part number", "unit
// price") must claim their column before broad ones ("part", "unit") can.
const FIELDS = [
  { field: "part_number", tokens: ["partnumber", "partno", "sku", "articleno"] },
  { field: "unit_price", tokens: ["unitprice", "unitcost", "price", "cost"] },
  {
    field: "critical_threshold",
    tokens: ["criticalthreshold", "critical", "reorderlevel", "reorder", "minstock", "minimum", "minqty"],
  },
  { field: "quantity", tokens: ["quantity", "qty", "onhand", "instock", "stock", "count"] },
  { field: "unit", tokens: ["uom", "unitofmeasure", "units", "unit"] },
  { field: "supplier", tokens: ["supplier", "vendor", "source"] },
  { field: "location", tokens: ["location", "stowage", "locker", "where", "stored"] },
  { field: "related_component", tokens: ["component", "category", "system", "group", "type"] },
  { field: "make", tokens: ["makemodel", "make", "brand", "manufacturer", "model"] },
  { field: "part_name", tokens: ["partname", "itemname", "item", "part", "name", "description"] },
] as const;

export async function POST(request: Request) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "missing_file" }, { status: 400 });

  const isXlsx =
    /\.xlsx$/i.test(file.name) ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  let grid: string[][];
  try {
    grid = isXlsx
      ? await parseXlsx(await file.arrayBuffer())
      : parseCsv(await file.text());
  } catch (err) {
    console.error("spreadsheet parse failed", err);
    return NextResponse.json({ error: "parse_failed" }, { status: 200 });
  }

  if (grid.length < 2) {
    return NextResponse.json(
      { error: "parse_failed", raw: "Need a header row plus at least one data row" },
      { status: 200 },
    );
  }

  const [headers, ...dataRows] = grid;
  const col = mapColumns(headers, FIELDS);
  if (col.part_name == null) {
    // No recognizable name column — fall back to the first column so the
    // preview still shows something editable rather than a dead end.
    const taken = new Set(Object.values(col));
    col.part_name = headers.findIndex((_, i) => !taken.has(i));
    if (col.part_name === -1) col.part_name = 0;
  }

  const cell = (row: string[], field: string): string =>
    col[field] != null ? (row[col[field]] ?? "").trim() : "";

  const rows = dataRows
    .map((r) => ({
      part_name: cell(r, "part_name"),
      part_number: cell(r, "part_number") || null,
      make: cell(r, "make") || null,
      quantity: parseIntLoose(cell(r, "quantity")) ?? 0,
      unit: cell(r, "unit") || "Units",
      location: cell(r, "location") || null,
      related_component: cell(r, "related_component") || null,
      critical_threshold: parseIntLoose(cell(r, "critical_threshold")),
      unit_price: parseMoneyLoose(cell(r, "unit_price")),
      supplier: cell(r, "supplier") || null,
    }))
    .filter((r) => r.part_name !== "");

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "parse_failed", raw: "No rows with a part name found" },
      { status: 200 },
    );
  }

  return NextResponse.json({ rows, count: rows.length });
}
