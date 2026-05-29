import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import YardPeriodEditor from "@/components/YardPeriodEditor";
import type { YardPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function YardPeriodManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/yard");
  const { id } = await params;

  const supabase = await createClient();
  const { data: period } = await supabase
    .from("yard_periods")
    .select()
    .eq("id", id)
    .single<YardPeriod>();
  if (!period) notFound();

  return <YardPeriodEditor initial={period} />;
}
