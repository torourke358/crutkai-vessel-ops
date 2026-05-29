import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/yard-tasks/past-costs?q=<title>
// Returns yard tasks from CLOSED yard periods whose title trigram-matches
// the query. Used by the "what did we pay last time" hint banner on the
// new-task form.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ items: [] });

  // First grab the IDs of closed periods, then filter yard_tasks. ILIKE is
  // good enough at the data volumes the captain mentioned; the gin trigram
  // index keeps it fast even at thousands.
  const { data: closedPeriods } = await supabase
    .from("yard_periods")
    .select("id, name, end_date")
    .eq("status", "closed");

  const closedIds = (closedPeriods ?? []).map((p) => p.id);
  if (closedIds.length === 0) return NextResponse.json({ items: [] });
  const nameById = new Map((closedPeriods ?? []).map((p) => [p.id, p.name]));
  const endById = new Map((closedPeriods ?? []).map((p) => [p.id, p.end_date]));

  const { data: matches } = await supabase
    .from("yard_tasks")
    .select("id, title, actual_cost, completed_at, yard_period_id")
    .in("yard_period_id", closedIds)
    .ilike("title", `%${q}%`)
    .not("actual_cost", "is", null)
    .order("completed_at", { ascending: false })
    .limit(10);

  const items = (matches ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    actual_cost: m.actual_cost,
    completed_at: m.completed_at,
    period_name: nameById.get(m.yard_period_id) ?? "Unknown",
    period_end: endById.get(m.yard_period_id) ?? null,
  }));

  return NextResponse.json({ items });
}
