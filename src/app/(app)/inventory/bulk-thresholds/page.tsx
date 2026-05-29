import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import BulkThresholdEditor, {
  type BulkThresholdRow,
} from "@/components/BulkThresholdEditor";
import type { Component } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RawRow {
  id: string;
  part_name: string;
  part_number: string | null;
  quantity: number;
  unit: string;
  critical_threshold: number | null;
  related_component_id: string | null;
  component: { name: string } | null;
}

export default async function BulkThresholdsPage() {
  if ((await getUserRole()) !== "admin") redirect("/inventory");

  const supabase = await createClient();
  const [{ data: rows }, { data: components }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select(
        "id, part_name, part_number, quantity, unit, critical_threshold, related_component_id, component:components(name)",
      )
      .order("part_name", { ascending: true })
      .returns<RawRow[]>(),
    supabase
      .from("components")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Component[]>(),
  ]);

  const editable: BulkThresholdRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    part_name: r.part_name,
    part_number: r.part_number,
    componentId: r.related_component_id,
    componentName: r.component?.name ?? null,
    quantity: r.quantity,
    unit: r.unit,
    critical_threshold: r.critical_threshold,
  }));

  return <BulkThresholdEditor rows={editable} components={components ?? []} />;
}
