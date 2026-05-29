import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import InventoryEditor from "@/components/InventoryEditor";
import type { Component, InventoryItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/inventory");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: components }] = await Promise.all([
    supabase
      .from("inventory_items")
      .select()
      .eq("id", id)
      .single<InventoryItem>(),
    supabase
      .from("components")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Component[]>(),
  ]);

  if (!item) notFound();

  return <InventoryEditor initial={item} components={components ?? []} />;
}
