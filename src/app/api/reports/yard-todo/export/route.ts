import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { YARD_TASK_URGENCY_LABELS, type YardTaskStatus, type YardTaskUrgency } from "@/lib/types";

interface Row {
  id: string;
  yard_period_id: string;
  quadrant_id: string;
  title: string;
  status: YardTaskStatus;
  urgency: YardTaskUrgency | null;
  owner_id: string | null;
  due_date: string | null;
  progress_pct: number;
  effort: "S" | "M" | "L" | null;
  period: { status: string; name: string } | null;
  quadrant: { name: string } | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: rows }, { data: users }] = await Promise.all([
    supabase
      .from("yard_tasks")
      .select(
        "id, yard_period_id, quadrant_id, title, status, urgency, owner_id, due_date, progress_pct, effort, period:yard_periods!inner(status, name), quadrant:yard_quadrants(name)",
      )
      .neq("status", "done")
      .neq("period.status", "closed")
      .order("due_date", { ascending: true, nullsFirst: false })
      .returns<Row[]>(),
    supabase.from("user_profiles").select("id, full_name"),
  ]);

  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Thor · M/Y Anne-Marie";
  wb.created = new Date();
  const ws = wb.addWorksheet("Yard tasks to complete", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Task",
    "Period",
    "Quadrant",
    "Status",
    "Urgency",
    "Owner",
    "Effort",
    "Due date",
    "Progress %",
  ];
  ws.addRow(headers);

  for (const r of rows ?? []) {
    ws.addRow([
      r.title,
      r.period?.name ?? "",
      r.quadrant?.name ?? "",
      r.status,
      r.urgency ? YARD_TASK_URGENCY_LABELS[r.urgency] : "",
      r.owner_id ? nameById.get(r.owner_id) ?? "Unknown" : "",
      r.effort ?? "",
      r.due_date ? new Date(r.due_date + "T12:00:00") : null,
      r.progress_pct,
    ]);
    const lastRow = ws.lastRow!;
    lastRow.getCell(8).numFmt = "mm/dd/yyyy";
    lastRow.getCell(9).numFmt = "0";
  }

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" }, // slate-200
  };
  ws.columns.forEach((c) => {
    c.width = 22;
  });

  const today = todayLocal();
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="yard-todo-${today}.xlsx"`,
    },
  });
}
