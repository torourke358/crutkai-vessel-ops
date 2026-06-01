import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { computeDueState } from "@/lib/maintenance";
import type { DueType } from "@/lib/types";

interface Row {
  id: string;
  title: string;
  due_type: DueType;
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  hours_at_last_done: number | null;
  priority: "low" | "moderate" | "high" | "critical" | null;
  equipment: { name: string; current_hours: number | null } | null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = todayLocal();
  const { data: tasks } = await supabase
    .from("maintenance_tasks")
    .select(
      "id, title, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, priority, equipment:equipment(name, current_hours)",
    )
    .eq("active", true)
    .returns<Row[]>();

  const overdue = (tasks ?? [])
    .map((t) => ({
      task: t,
      due: computeDueState(t, t.equipment?.current_hours ?? null, today),
    }))
    .filter(({ due }) => due.state === "overdue" || due.state === "due");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Thor · M/Y Anne-Marie";
  wb.created = new Date();
  const ws = wb.addWorksheet("Maintenance overdue", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [
    "Task",
    "Equipment",
    "Due type",
    "Due at",
    "Current hours",
    "Priority",
  ];
  ws.addRow(headers);

  for (const { task, due } of overdue) {
    ws.addRow([
      task.title,
      task.equipment?.name ?? "",
      task.due_type,
      task.due_type === "hours"
        ? (typeof due.dueAt === "number" ? due.dueAt : null)
        : (typeof due.dueAt === "string" ? due.dueAt : ""),
      task.equipment?.current_hours ?? null,
      task.priority ?? "",
    ]);
  }

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFE4E6" }, // rose-100
  };
  ws.columns.forEach((c) => {
    c.width = 24;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="maintenance-overdue-${today}.xlsx"`,
    },
  });
}
