import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import EquipmentEditor from "@/components/EquipmentEditor";
import type { Component, VesselZone } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewEquipmentPage() {
  if ((await getUserRole()) !== "admin") redirect("/equipment");

  const supabase = await createClient();

  // Yard periods so a piece of kit can be recorded as bought in a refit.
  const { data: yardPeriods } = await supabase
    .from("yard_periods")
    .select("id, name")
    .order("start_date", { ascending: false });
  const [{ data: components }, { data: zones }] = await Promise.all([
    supabase
      .from("components")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Component[]>(),
    supabase
      .from("vessel_zones")
      .select()
      .eq("active", true)
      .order("display_order")
      .returns<VesselZone[]>(),
  ]);

  return (
    <EquipmentEditor
      initial={null}
      components={components ?? []}
      zones={zones ?? []}
      yardPeriods={yardPeriods ?? []}
    />
  );
}
