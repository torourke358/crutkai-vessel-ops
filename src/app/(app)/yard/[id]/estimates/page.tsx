import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadYardPeriod } from "@/lib/yard-period-page";
import YardPeriodHeader from "@/components/YardPeriodHeader";
import YardEstimates from "@/components/YardEstimates";
import type { YardVendor } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function YardEstimatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await loadYardPeriod(id);
  if (!ctx.period) notFound();
  // Money is admin-only, the same posture as the petty cash dashboard.
  if (!ctx.isAdmin) redirect(`/yard/${id}`);

  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("yard_vendors")
    .select()
    .eq("active", true)
    .order("name")
    .returns<YardVendor[]>();

  const money = ctx.money;

  return (
    <div className="space-y-5 pb-8">
      <YardPeriodHeader
        period={ctx.period}
        active="estimates"
        isAdmin={ctx.isAdmin}
        money={money?.blocks[0] ?? null}
        clashCount={ctx.clashCount}
      />
      <YardEstimates
        periodId={ctx.period.id}
        periodStart={ctx.period.start_date}
        periodEnd={ctx.period.end_date}
        estimates={money?.estimates ?? []}
        invoices={money?.invoices ?? []}
        payments={money?.payments ?? []}
        vendors={vendors ?? []}
        zones={ctx.zones}
      />
    </div>
  );
}
