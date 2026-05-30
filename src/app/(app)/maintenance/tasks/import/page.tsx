import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import MaintenanceImportFlow from "@/components/MaintenanceImportFlow";
import type { Component } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MaintenanceImportPage() {
  if ((await getUserRole()) !== "admin") redirect("/maintenance");

  const supabase = await createClient();
  const [{ data: components }, { data: equipment }] = await Promise.all([
    supabase
      .from("components")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Component[]>(),
    supabase.from("equipment").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <MaintenanceImportFlow
      components={components ?? []}
      existingEquipment={equipment ?? []}
    />
  );
}
