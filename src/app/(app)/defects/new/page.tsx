import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DefectForm from "@/components/DefectForm";
import type { Equipment, UserProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewDefectPage() {
  const supabase = await createClient();
  const [{ data: equipment }, { data: users }] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .returns<Pick<Equipment, "id" | "name">[]>(),
    supabase
      .from("user_profiles")
      .select("id, full_name")
      .eq("active", true)
      .order("full_name")
      .returns<Pick<UserProfile, "id" | "full_name">[]>(),
  ]);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">New defect</h1>
        <Link href="/defects" className="text-sm text-slate-500">
          Back
        </Link>
      </div>
      <DefectForm equipment={equipment ?? []} users={users ?? []} />
    </div>
  );
}
