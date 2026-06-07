import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/format";
import { csvResponse } from "@/lib/csv";

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
// Yard throughput, exported as a Numbers-friendly CSV.
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

  const headers = [
    "Completed",
    "Crew member",
    "Task",
    "Effort",
    "Cost",
    "Yard period",
    "Quadrant",
  ];
  const dataRows = (rows ?? []).map((r) => [
    r.completed_at ? r.completed_at.slice(0, 10) : "",
    r.completed_by ? nameById.get(r.completed_by) ?? "Unknown" : "Unassigned",
    r.title,
    r.effort ?? "",
    r.actual_cost ?? "",
    periodById.get(r.yard_period_id) ?? "",
    quadById.get(r.quadrant_id) ?? "",
  ]);

  return csvResponse(`yard-${from}-to-${to}.csv`, headers, dataRows);
}
