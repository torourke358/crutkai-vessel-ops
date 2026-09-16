import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadYardPeriod } from "@/lib/yard-period-page";
import YardPeriodHeader from "@/components/YardPeriodHeader";
import YardGantt from "@/components/YardGantt";
import type { YardEstimate, YardVendor } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function YardTimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await loadYardPeriod(id);
  if (!ctx.period) notFound();

  // Crew can read the timeline — knowing what is happening in which room is
  // exactly the thing they need — but only admins get the money strip, and
  // only admins can drag a bar.
  const supabase = await createClient();
  const [{ data: estimates }, { data: vendors }] = await Promise.all([
    supabase
      .from("yard_estimates")
      .select()
      .eq("yard_period_id", id)
      .order("start_date", { ascending: true, nullsFirst: false })
      .returns<YardEstimate[]>(),
    supabase.from("yard_vendors").select().order("name").returns<YardVendor[]>(),
  ]);

  return (
    <div className="space-y-5 pb-8">
      <YardPeriodHeader
        period={ctx.period}
        active="timeline"
        isAdmin={ctx.isAdmin}
        money={ctx.money?.blocks[0] ?? null}
        clashCount={ctx.clashCount}
      />
      <YardGantt
        period={ctx.period}
        quadrants={ctx.quadrants}
        tasks={ctx.tasks}
        estimates={estimates ?? []}
        vendors={vendors ?? []}
        zones={ctx.zones}
        rules={ctx.rules}
        isAdmin={ctx.isAdmin}
      />
    </div>
  );
}
