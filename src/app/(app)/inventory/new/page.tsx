import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import InventoryEditor from "@/components/InventoryEditor";
import type { Component } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewInventoryItemPage() {
  if ((await getUserRole()) !== "admin") redirect("/inventory");

  const supabase = await createClient();
  const { data: components } = await supabase
    .from("components")
    .select("id, code, name, display_order, active")
    .eq("active", true)
    .order("display_order")
    .returns<Component[]>();

  return <InventoryEditor initial={null} components={components ?? []} />;
}
