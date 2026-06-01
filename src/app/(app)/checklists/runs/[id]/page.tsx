import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import ChecklistRunner from "@/components/ChecklistRunner";
import type {
  ChecklistRun,
  ChecklistRunItem,
  ChecklistTemplate,
  ChecklistTemplateItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ChecklistRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("checklist_runs")
    .select()
    .eq("id", id)
    .single<ChecklistRun>();
  if (!run) notFound();

  const [{ data: template }, { data: tplItems }, { data: runItems }] =
    await Promise.all([
      supabase
        .from("checklist_templates")
        .select()
        .eq("id", run.template_id)
        .single<ChecklistTemplate>(),
      supabase
        .from("checklist_template_items")
        .select()
        .eq("template_id", run.template_id)
        .order("display_order")
        .returns<ChecklistTemplateItem[]>(),
      supabase
        .from("checklist_run_items")
        .select()
        .eq("run_id", id)
        .returns<ChecklistRunItem[]>(),
    ]);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          {template?.title ?? "Checklist run"}
        </h1>
        <Link href="/checklists" className="text-sm text-slate-500">
          Back
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Started {formatDate(run.started_at.slice(0, 10))}.
        {run.completed_at && ` Completed ${formatDate(run.completed_at.slice(0, 10))}.`}
      </p>
      <ChecklistRunner
        run={run}
        templateItems={tplItems ?? []}
        runItems={runItems ?? []}
      />
    </div>
  );
}
