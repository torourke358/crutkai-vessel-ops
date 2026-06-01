import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import InventoryEditor from "@/components/InventoryEditor";
import InventoryDocuments from "@/components/InventoryDocuments";
import type {
  Component,
  InventoryDocument,
  InventoryItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/inventory");

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: components }, { data: docs }] = await Promise.all([
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
    supabase
      .from("inventory_documents")
      .select()
      .eq("inventory_item_id", id)
      .order("uploaded_at", { ascending: false })
      .returns<InventoryDocument[]>(),
  ]);

  if (!item) notFound();

  return (
    <div className="space-y-6 pb-8">
      <InventoryEditor initial={item} components={components ?? []} />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
        <InventoryDocuments
          inventoryItemId={item.id}
          initial={docs ?? []}
          isAdmin={true}
        />
      </section>
    </div>
  );
}
