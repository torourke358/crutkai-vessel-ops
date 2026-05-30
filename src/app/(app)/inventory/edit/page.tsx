import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import InventoryGrid, { type GridRow } from "@/components/InventoryGrid";
import type { Component } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InventoryGridPage() {
  if ((await getUserRole()) !== "admin") redirect("/inventory");

  const supabase = await createClient();
  const [{ data: rows }, { data: components }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select(
        "id, part_name, part_number, make, quantity, unit, location, notes, critical_threshold, related_component_id",
      )
      .order("part_name", { ascending: true })
      .returns<GridRow[]>(),
    supabase
      .from("components")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Component[]>(),
  ]);

  return <InventoryGrid rows={rows ?? []} components={components ?? []} />;
}
