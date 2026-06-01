import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import ChecklistTemplateEditor from "@/components/ChecklistTemplateEditor";
import type { ChecklistTemplate, ChecklistTemplateItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminChecklistTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if ((await getUserRole()) !== "admin") redirect("/checklists");

  const { id } = await params;
  const supabase = await createClient();
  const [{ data: tpl }, { data: items }] = await Promise.all([
    supabase
      .from("checklist_templates")
      .select()
      .eq("id", id)
      .single<ChecklistTemplate>(),
    supabase
      .from("checklist_template_items")
      .select()
      .eq("template_id", id)
      .order("display_order")
      .returns<ChecklistTemplateItem[]>(),
  ]);

  if (!tpl) notFound();

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">{tpl.title}</h1>
        <Link href="/admin/checklists" className="text-sm text-slate-500">
          Back to templates
        </Link>
      </div>
      <ChecklistTemplateEditor template={tpl} initialItems={items ?? []} />
    </div>
  );
}
