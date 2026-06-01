import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import EquipmentEditor from "@/components/EquipmentEditor";
import type { Component, VesselZone } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewEquipmentPage() {
  if ((await getUserRole()) !== "admin") redirect("/equipment");

  const supabase = await createClient();
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
    />
  );
}
