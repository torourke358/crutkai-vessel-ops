import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";

interface Row {
  id: string;
  task_id: string;
  completed_at: string;
  completed_by: string | null;
  hours_at_completion: number | null;
  comments: string | null;
  maintenance_task: { title: string; equipment: { name: string } | null } | null;
}

// GET /api/reports/maintenance/export?from=YYYY-MM-DD&to=YYYY-MM-DD
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

  const [{ data: rows, error }, { data: users }] = await Promise.all([
    supabase
      .from("maintenance_history")
      .select(
        "id, task_id, completed_at, completed_by, hours_at_completion, comments, maintenance_task:maintenance_tasks(title, equipment:equipment(name))",
      )
      .gte("completed_at", fromIso)
      .lte("completed_at", toIso)
      .order("completed_at", { ascending: false })
      .returns<Row[]>(),
    supabase.from("user_profiles").select("id, full_name"),
  ]);

  if (error) {
    console.error("maintenance report export failed", error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }

  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Thor · M/Y Anne-Marie";
  wb.created = new Date();

  const ws = wb.addWorksheet("Maintenance", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Completed",
    "Crew member",
    "Task",
    "Equipment",
    "Hours at completion",
    "Comments",
  ];
  ws.addRow(headers);

  const widths = headers.map((h) => h.length);
  const note = (i: number, v: unknown) => {
    const len = v == null ? 0 : String(v).length;
    if (len > widths[i]) widths[i] = len;
  };

  for (const r of rows ?? []) {
    const values: (string | number | Date | null)[] = [
      new Date(r.completed_at),
      r.completed_by ? nameById.get(r.completed_by) ?? "Unknown" : "Unassigned",
      r.maintenance_task?.title ?? "(deleted task)",
      r.maintenance_task?.equipment?.name ?? "",
      r.hours_at_completion ?? null,
      r.comments ?? "",
    ];
    const row = ws.addRow(values);
    row.getCell(1).numFmt = "mm/dd/yyyy";
    row.getCell(5).numFmt = "0";
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
    col.width = Math.min(widths[i] + 2, i === 5 ? 60 : 30);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="maintenance-${from}-to-${to}.xlsx"`,
    },
  });
}
