import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import PlanView from "@/components/drydock/PlanView";
import type { DisassemblyPlan, DisassemblyStep, YardPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DisassemblyPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/yard");
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: plan }, { data: steps }, { data: periods }] = await Promise.all([
    supabase
      .from("disassembly_plans")
      .select()
      .eq("id", id)
      .single<DisassemblyPlan>(),
    supabase
      .from("disassembly_steps")
      .select()
      .eq("plan_id", id)
      .order("seq")
      .returns<DisassemblyStep[]>(),
    supabase
      .from("yard_periods")
      .select()
      .order("start_date", { ascending: false })
      .returns<YardPeriod[]>(),
  ]);

  if (!plan) notFound();

  return <PlanView plan={plan} initialSteps={steps ?? []} periods={periods ?? []} />;
}
