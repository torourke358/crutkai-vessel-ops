import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import MaintenanceTaskEditor from "@/components/MaintenanceTaskEditor";

export const dynamic = "force-dynamic";

export default async function NewMaintenanceTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ equipment?: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/maintenance");

  const { equipment: equipmentParam } = await searchParams;
  const supabase = await createClient();
  const [{ data: equipment }, { data: users }] = await Promise.all([
    supabase.from("equipment").select("id, name").eq("active", true).order("name"),
    supabase.from("user_profiles").select("id, full_name").eq("active", true).order("full_name"),
  ]);

  return (
    <MaintenanceTaskEditor
      initial={null}
      equipment={equipment ?? []}
      users={users ?? []}
      defaultEquipmentId={equipmentParam ?? null}
    />
  );
}
