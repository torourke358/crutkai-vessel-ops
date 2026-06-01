import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  type Defect,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const SEV_TONE: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-rose-100 text-rose-700",
};

const STATUS_TONE: Record<string, string> = {
  open: "bg-rose-100 text-rose-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

export default async function DefectsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("defects")
    .select()
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .returns<Defect[]>();

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Defects</h1>
        <Link
          href="/defects/new"
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          + New defect
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        Issues found during operations. Distinct from preventative maintenance.
      </p>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {(rows ?? []).length === 0 ? (
          <li className="p-6 text-center text-sm text-slate-400">
            No defects yet.
          </li>
        ) : (
          (rows ?? []).map((d) => (
            <li key={d.id}>
              <Link
                href={`/defects/${d.id}`}
                className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{d.title}</p>
                  <p className="truncate text-xs text-slate-400">
                    Reported {formatDate(d.created_at.slice(0, 10))}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[d.status]}`}
                  >
                    {DEFECT_STATUS_LABELS[d.status]}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SEV_TONE[d.severity]}`}
                  >
                    {DEFECT_SEVERITY_LABELS[d.severity]}
                  </span>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
