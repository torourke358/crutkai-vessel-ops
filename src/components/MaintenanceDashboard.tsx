"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { DueState } from "@/lib/maintenance";

export interface MaintenanceDashboardTask {
  id: string;
  title: string;
  priority: "low" | "moderate" | "high" | "critical" | null;
  due_type: "calendar" | "hours";
  equipmentName: string;
  componentName: string | null;
  currentHours: number | null;
  lastDoneDate: string | null;
  lastDoneHours: number | null;
  lastCompletedAt: string | null;
  lastCompletedHours: number | null;
  lastCompletedComments: string | null;
  state: DueState;
  dueAt: string | number | null;
  dueSoon: boolean;
}

const STATE_BADGE: Record<DueState, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  due: "bg-amber-100 text-amber-800",
  overdue: "bg-rose-100 text-rose-800",
};

const PRIORITY_TEXT: Record<string, string> = {
  critical: "text-rose-700",
  high: "text-amber-700",
  moderate: "text-slate-600",
  low: "text-slate-400",
};

export default function MaintenanceDashboard({
  tasks,
  asOf,
}: {
  tasks: MaintenanceDashboardTask[];
  asOf: string;
}) {
  const { timeDue, hoursDue, overdue } = useMemo(() => {
    const timeDue: MaintenanceDashboardTask[] = [];
    const hoursDue: MaintenanceDashboardTask[] = [];
    const overdue: MaintenanceDashboardTask[] = [];
    for (const t of tasks) {
      if (t.state === "overdue") overdue.push(t);
      else if (t.state === "due") {
        if (t.due_type === "calendar") timeDue.push(t);
        else hoursDue.push(t);
      }
    }
    return { timeDue, hoursDue, overdue };
  }, [tasks]);

  return (
    <div className="space-y-6">
      <Section title="Time-based tasks due" items={timeDue} emptyMessage={`Nothing due as of ${asOf}.`} />
      <Section title="Hours-based tasks due" items={hoursDue} emptyMessage="Nothing hours-based is due." />
      <Section
        title="Overdue"
        items={overdue}
        emptyMessage="Nothing is overdue. Nice."
        tone="rose"
      />
    </div>
  );
}

function Section({
  title,
  items,
  emptyMessage,
  tone,
}: {
  title: string;
  items: MaintenanceDashboardTask[];
  emptyMessage: string;
  tone?: "rose";
}) {
  return (
    <section className="space-y-2">
      <h2 className={`text-sm font-semibold ${tone === "rose" ? "text-rose-700" : "text-slate-900"}`}>
        {title} <span className="text-slate-400">({items.length})</span>
      </h2>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {items.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">{emptyMessage}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((t) => (
              <li key={t.id} className="p-3">
                <Link
                  href={`/maintenance/tasks/${t.id}`}
                  className="flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {t.title}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {t.equipmentName}
                      {t.componentName && (
                        <span className="text-slate-400"> · {t.componentName}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {t.due_type === "calendar"
                        ? `Due ${formatDateOrDash(t.dueAt as string | null)}`
                        : `Due at ${t.dueAt ?? "—"} hrs · current ${t.currentHours ?? "—"} hrs`}
                      {t.lastCompletedAt && (
                        <>
                          {" · "}last done{" "}
                          {formatDate(t.lastCompletedAt.slice(0, 10))}
                          {t.lastCompletedHours != null && (
                            <span> @ {t.lastCompletedHours} hrs</span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE[t.state]}`}>
                      {t.state}
                    </span>
                    {t.priority && (
                      <span className={`text-[10px] uppercase ${PRIORITY_TEXT[t.priority]}`}>
                        {t.priority}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function formatDateOrDash(v: string | null): string {
  return v ? formatDate(v) : "—";
}
