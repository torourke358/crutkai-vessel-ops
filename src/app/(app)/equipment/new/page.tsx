import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import EquipmentEditor from "@/components/EquipmentEditor";
import type { Component } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewEquipmentPage() {
  if ((await getUserRole()) !== "admin") redirect("/equipment");

  const supabase = await createClient();
  const { data: components } = await supabase
    .from("components")
    .select("id, code, name, display_order, active")
    .eq("active", true)
    .order("display_order")
    .returns<Component[]>();

  return <EquipmentEditor initial={null} components={components ?? []} />;
}
