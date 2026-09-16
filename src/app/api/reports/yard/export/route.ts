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
  estimate_id: string | null;
}

// GET /api/reports/yard/export?from=YYYY-MM-DD&to=YYYY-MM-DD
// GET /api/reports/yard/export?period=<uuid>
//
// Yard throughput, exported as a Numbers-friendly CSV.
//
// ⚠ THE DATE-RANGE FORM CANNOT SEE IMPORTED HISTORY. It filters on
// completed_at, and the prior-period importer (/api/yard-periods/import) never
// sets it — so the Roscioli 2012–13 refit, 61 real work orders and $723,247.34,
// has never once appeared in this export. Rather than backfill a completion
// timestamp nobody recorded, `?period=` scopes the export to one yard period
// and drops the date filter entirely. The date form is unchanged.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period");
  const from = url.searchParams.get("from") ?? todayLocal();
  const to = url.searchParams.get("to") ?? todayLocal();

  const select =
    "id, title, effort, actual_cost, completed_at, completed_by, yard_period_id, quadrant_id, estimate_id";

  const query = periodId
    ? supabase
        .from("yard_tasks")
        .select(select)
        .eq("yard_period_id", periodId)
        .order("title", { ascending: true })
        .returns<Row[]>()
    : supabase
        .from("yard_tasks")
        .select(select)
        .gte("completed_at", `${from}T00:00:00`)
        .lte("completed_at", `${to}T23:59:59`)
        .order("completed_at", { ascending: false })
        .returns<Row[]>();

  const [{ data: rows, error }, { data: users }, { data: periods }, { data: quads },
    { data: estimates }, { data: vendors }] = await Promise.all([
    query,
    supabase.from("user_profiles").select("id, full_name"),
    supabase.from("yard_periods").select("id, name"),
    supabase.from("yard_quadrants").select("id, name"),
    supabase.from("yard_estimates").select("id, title, vendor_id"),
    supabase.from("yard_vendors").select("id, name"),
  ]);

  if (error) {
    console.error("yard report export failed", error);
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }

  const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const));
  const periodById = new Map((periods ?? []).map((p) => [p.id, p.name] as const));
  const quadById = new Map((quads ?? []).map((q) => [q.id, q.name] as const));
  const vendorById = new Map((vendors ?? []).map((v) => [v.id, v.name] as const));
  const estimateById = new Map((estimates ?? []).map((e) => [e.id, e] as const));

  const headers = [
    "Completed",
    "Crew member",
    "Task",
    "Effort",
    "Cost",
    "Yard period",
    "Quadrant",
    "Vendor",
    "Estimate",
  ];
  const dataRows = (rows ?? []).map((r) => {
    const est = r.estimate_id ? estimateById.get(r.estimate_id) : undefined;
    return [
      r.completed_at ? r.completed_at.slice(0, 10) : "",
      r.completed_by ? (nameById.get(r.completed_by) ?? "Unknown") : "Unassigned",
      r.title,
      r.effort ?? "",
      r.actual_cost ?? "",
      periodById.get(r.yard_period_id) ?? "",
      quadById.get(r.quadrant_id) ?? "",
      est?.vendor_id ? (vendorById.get(est.vendor_id) ?? "") : "",
      est?.title ?? "",
    ];
  });

  const filename = periodId
    ? `yard-${(periodById.get(periodId) ?? "period").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`
    : `yard-${from}-to-${to}.csv`;

  return csvResponse(filename, headers, dataRows);
}
