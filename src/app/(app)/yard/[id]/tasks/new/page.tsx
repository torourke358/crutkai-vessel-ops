import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import YardTaskEditor from "@/components/YardTaskEditor";
import type { YardPeriod, YardQuadrant } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewYardTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/yard");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: period }, { data: quadrants }, { data: users }] = await Promise.all([
    supabase.from("yard_periods").select().eq("id", id).single<YardPeriod>(),
    supabase
      .from("yard_quadrants")
      .select()
      .eq("yard_period_id", id)
      .order("display_order")
      .returns<YardQuadrant[]>(),
    supabase.from("user_profiles").select("id, full_name").eq("active", true),
  ]);

  if (!period) notFound();

  return (
    <YardTaskEditor
      periodId={period.id}
      initial={null}
      quadrants={quadrants ?? []}
      users={users ?? []}
    />
  );
}
