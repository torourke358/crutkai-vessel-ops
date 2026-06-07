import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { csvResponse } from "@/lib/csv";

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

  const headers = [
    "Completed",
    "Crew member",
    "Task",
    "Equipment",
    "Hours at completion",
    "Comments",
  ];
  const dataRows = (rows ?? []).map((r) => [
    r.completed_at.slice(0, 10),
    r.completed_by ? nameById.get(r.completed_by) ?? "Unknown" : "Unassigned",
    r.maintenance_task?.title ?? "(deleted task)",
    r.maintenance_task?.equipment?.name ?? "",
    r.hours_at_completion ?? "",
    r.comments ?? "",
  ]);

  return csvResponse(`maintenance-${from}-to-${to}.csv`, headers, dataRows);
}
