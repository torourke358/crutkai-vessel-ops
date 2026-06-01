import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { computeDueState, isDueSoon } from "@/lib/maintenance";
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

  const dueSoon: { task: Row; nextDue: string | number | null; remaining: string }[] = [];
  for (const t of tasks ?? []) {
    const due = computeDueState(t, t.equipment?.current_hours ?? null, today);
    if (due.state !== "ok") continue;
    if (!isDueSoon(t, t.equipment?.current_hours ?? null, today)) continue;

    let nextDue: string | number | null = null;
    let remaining = "";
    if (t.due_type === "hours" && t.interval_hours != null) {
      const base = t.hours_at_last_done ?? 0;
      nextDue = base + t.interval_hours;
      const current = t.equipment?.current_hours ?? 0;
      remaining = `${nextDue - current} hrs`;
    } else if (t.due_type === "calendar" && typeof due.dueAt === "string") {
      nextDue = due.dueAt;
      const [y, m, d] = due.dueAt.split("-").map(Number);
      const [ty, tm, td] = today.split("-").map(Number);
      const next = new Date(y, m - 1, d, 12).getTime();
      const now = new Date(ty, tm - 1, td, 12).getTime();
      const days = Math.round((next - now) / (1000 * 60 * 60 * 24));
      remaining = `${days} d`;
    }
    dueSoon.push({ task: t, nextDue, remaining });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Thor · M/Y Anne-Marie";
  wb.created = new Date();
  const ws = wb.addWorksheet("Maintenance due soon", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = ["Task", "Equipment", "Due type", "Next due", "Remaining", "Priority"];
  ws.addRow(headers);

  for (const { task, nextDue, remaining } of dueSoon) {
    ws.addRow([
      task.title,
      task.equipment?.name ?? "",
      task.due_type,
      typeof nextDue === "number" ? nextDue : nextDue ?? "",
      remaining,
      task.priority ?? "",
    ]);
  }

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEF3C7" }, // amber-100
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
      "Content-Disposition": `attachment; filename="maintenance-due-soon-${today}.xlsx"`,
    },
  });
}
