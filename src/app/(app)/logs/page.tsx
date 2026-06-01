import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VesselLogsList from "@/components/VesselLogsList";
import type { VesselLog } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VesselLogsPage() {
  const supabase = await createClient();
  const [{ data: logs }, { data: users }] = await Promise.all([
    supabase
      .from("vessel_logs")
      .select()
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<VesselLog[]>(),
    supabase.from("user_profiles").select("id, full_name"),
  ]);
  const nameById = new Map(
    (users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const),
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Vessel logs</h1>
        <Link href="/" className="text-sm text-slate-500">
          Back
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Daily diary of vessel ops — crossings, charters, guest arrivals, crew
        activities. Anyone signed in can add an entry.
      </p>
      <VesselLogsList initial={logs ?? []} nameById={nameById} />
    </div>
  );
}
