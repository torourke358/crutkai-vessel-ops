import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { computeDueState } from "@/lib/maintenance";
import { csvResponse } from "@/lib/csv";
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

  const headers = [
    "Task",
    "Equipment",
    "Due type",
    "Due at",
    "Current hours",
    "Priority",
  ];
  const dataRows = overdue.map(({ task, due }) => [
    task.title,
    task.equipment?.name ?? "",
    task.due_type,
    task.due_type === "hours"
      ? typeof due.dueAt === "number"
        ? due.dueAt
        : ""
      : typeof due.dueAt === "string"
        ? due.dueAt
        : "",
    task.equipment?.current_hours ?? "",
    task.priority ?? "",
  ]);

  return csvResponse(`maintenance-overdue-${today}.csv`, headers, dataRows);
}
