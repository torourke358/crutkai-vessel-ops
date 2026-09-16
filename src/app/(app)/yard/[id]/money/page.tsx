import { notFound, redirect } from "next/navigation";
import { loadYardPeriod } from "@/lib/yard-period-page";
import YardPeriodHeader from "@/components/YardPeriodHeader";
import YardMoneyStatement from "@/components/YardMoneyStatement";

export const dynamic = "force-dynamic";

export default async function YardMoneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await loadYardPeriod(id);
  if (!ctx.period) notFound();
  if (!ctx.isAdmin || !ctx.money) redirect(`/yard/${id}`);

  return (
    <div className="space-y-5 pb-8">
      <YardPeriodHeader
        period={ctx.period}
        active="money"
        isAdmin={ctx.isAdmin}
        money={ctx.money.blocks[0] ?? null}
        clashCount={ctx.clashCount}
      />
      <YardMoneyStatement money={ctx.money} />
    </div>
  );
}
