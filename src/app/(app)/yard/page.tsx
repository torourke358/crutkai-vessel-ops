import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { YardPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-800",
  closed: "bg-amber-100 text-amber-800",
};

export default async function YardPeriodsPage() {
  const supabase = await createClient();
  const role = await getUserRole();

  const { data: periods } = await supabase
    .from("yard_periods")
    .select()
    .order("start_date", { ascending: false })
    .returns<YardPeriod[]>();

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Yard periods</h1>
        {role === "admin" && (
          <Link
            href="/yard/new"
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white active:bg-violet-700"
          >
            + New yard period
          </Link>
        )}
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {(periods ?? []).length === 0 ? (
          <li className="p-6 text-center text-sm text-slate-400">
            No yard periods yet.
          </li>
        ) : (
          (periods ?? []).map((p) => (
            <li key={p.id}>
              <Link
                href={`/yard/${p.id}`}
                className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  <p className="text-sm text-slate-500">
                    {formatDate(p.start_date)}
                    {p.end_date && <span> → {formatDate(p.end_date)}</span>}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-slate-100 text-slate-700"}`}
                >
                  {p.status}
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
