import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import ChecklistTemplateManager from "@/components/ChecklistTemplateManager";
import type { ChecklistTemplate, ChecklistTemplateItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminChecklistsPage() {
  if ((await getUserRole()) !== "admin") redirect("/checklists");

  const supabase = await createClient();
  const [{ data: templates }, { data: items }] = await Promise.all([
    supabase
      .from("checklist_templates")
      .select()
      .order("title")
      .returns<ChecklistTemplate[]>(),
    supabase
      .from("checklist_template_items")
      .select()
      .order("display_order")
      .returns<ChecklistTemplateItem[]>(),
  ]);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          Checklist templates
        </h1>
        <Link href="/checklists" className="text-sm text-slate-500">
          Back to checklists
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Define the SOPs crew will run. Each template snapshots when a run starts,
        so later edits don&apos;t change historical runs.
      </p>
      <ChecklistTemplateManager
        initialTemplates={templates ?? []}
        initialItems={items ?? []}
      />
    </div>
  );
}
