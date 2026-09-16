import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import YardPeriodEditor from "@/components/YardPeriodEditor";
import YardQuadrantsManager from "@/components/YardQuadrantsManager";
import type { YardPeriod, YardQuadrant } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function YardPeriodManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/yard");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: period }, { data: quadrants }] = await Promise.all([
    supabase.from("yard_periods").select().eq("id", id).single<YardPeriod>(),
    supabase
      .from("yard_quadrants")
      .select()
      .eq("yard_period_id", id)
      .order("display_order")
      .returns<YardQuadrant[]>(),
  ]);
  if (!period) notFound();

  return (
    <div className="space-y-4 pb-8">
      <YardPeriodEditor initial={period} />
      <YardQuadrantsManager periodId={period.id} quadrants={quadrants ?? []} />
    </div>
  );
}
