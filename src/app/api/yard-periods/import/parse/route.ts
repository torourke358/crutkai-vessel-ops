import { NextResponse } from "next/server";
import { getUserRole } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import {
  mapColumns,
  parseDateLoose,
  parseMoneyLoose,
  parseXlsx,
} from "@/lib/spreadsheet";

// POST /api/yard-periods/import/parse — step 1 of importing a PRIOR yard
// period's task list from a CSV/XLSX export. Maps the header row to task
// fields heuristically and returns editable preview rows; the commit route
// creates the period + tasks after Craig has checked them.

const FIELDS = [
  { field: "cost", tokens: ["actualcost", "cost", "amount", "price", "total", "usd", "spend"] },
  { field: "due_date", tokens: ["duedate", "date", "due", "completed", "when"] },
  { field: "area", tokens: ["quadrant", "area", "category", "section", "zone", "department", "group"] },
  { field: "title", tokens: ["task", "title", "job", "workitem", "item", "name"] },
  { field: "notes", tokens: ["notes", "comments", "remarks", "detail", "description"] },
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
    console.error("yard spreadsheet parse failed", err);
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
  if (col.title == null) {
    // Fall back to the first unclaimed column so nothing dead-ends.
    const taken = new Set(Object.values(col));
    col.title = headers.findIndex((_, i) => !taken.has(i));
    if (col.title === -1) col.title = 0;
  }

  const cell = (row: string[], field: string): string =>
    col[field] != null ? (row[col[field]] ?? "").trim() : "";

  const rows = dataRows
    .map((r) => ({
      title: cell(r, "title"),
      area: cell(r, "area") || null,
      notes: cell(r, "notes") || null,
      cost: parseMoneyLoose(cell(r, "cost")),
      due_date: parseDateLoose(cell(r, "due_date")),
    }))
    .filter((r) => r.title !== "");

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "parse_failed", raw: "No rows with a task title found" },
      { status: 200 },
    );
  }

  return NextResponse.json({ rows, count: rows.length });
}
