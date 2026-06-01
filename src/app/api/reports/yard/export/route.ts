import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";

interface Row {
  id: string;
  title: string;
  effort: "S" | "M" | "L" | null;
  actual_cost: number | null;
  completed_at: string | null;
  completed_by: string | null;
  yard_period_id: string;
  quadrant_id: string;
}

// GET /api/reports/yard/export?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? todayLocal();
  const to = url.searchParams.get("to") ?? todayLocal();
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const [{ data: rows, error }, { data: users }, { data: periods }, { data: quads }] =
    await Promise.all([
      supabase
        .from("yard_tasks")
        .select(
          "id, title, effort, actual_cost, completed_at, completed_by, yard_period_id, quadrant_id",
        )
        .gte("completed_at", fromIso)
        .lte("completed_at", toIso)
        .order("completed_at", { ascending: false })
        .returns<Row[]>(),
      supabase.from("user_profiles").select("id, full_name"),
      supabase.from("yard_periods").select("id, name"),
      supabase.from("yard_quadrants").select("id, name"),
    ]);

  if (error) {
    console.error("yard report export failed", error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }

  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const));
  const periodById = new Map((periods ?? []).map((p) => [p.id, p.name] as const));
  const quadById = new Map((quads ?? []).map((q) => [q.id, q.name] as const));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Thor · M/Y Anne-Marie";
  wb.created = new Date();

  const ws = wb.addWorksheet("Yard throughput", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Completed",
    "Crew member",
    "Task",
    "Effort",
    "Cost",
    "Yard period",
    "Quadrant",
  ];
  ws.addRow(headers);

  const widths = headers.map((h) => h.length);
  const note = (i: number, v: unknown) => {
    const len = v == null ? 0 : String(v).length;
    if (len > widths[i]) widths[i] = len;
  };

  for (const r of rows ?? []) {
    const completed = r.completed_at ? new Date(r.completed_at) : null;
    const values: (string | number | Date | null)[] = [
      completed,
      r.completed_by ? nameById.get(r.completed_by) ?? "Unknown" : "Unassigned",
      r.title,
      r.effort ?? "",
      r.actual_cost ?? null,
      periodById.get(r.yard_period_id) ?? "",
      quadById.get(r.quadrant_id) ?? "",
    ];
    const row = ws.addRow(values);
    row.getCell(1).numFmt = "mm/dd/yyyy";
    row.getCell(5).numFmt = "$#,##0.00";
    values.forEach((v, i) => note(i, v));
  }

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  ws.columns.forEach((col, i) => {
    col.width = Math.min(widths[i] + 2, 40);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="yard-${from}-to-${to}.xlsx"`,
    },
  });
}
