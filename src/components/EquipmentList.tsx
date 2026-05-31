"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Component } from "@/lib/types";

export type EquipmentPmState = "overdue" | "due_soon" | "ok" | "none";

export interface EquipmentRow {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  location_on_vessel: string | null;
  current_hours: number | null;
  componentId: string | null;
  componentName: string | null;
  active: boolean;
  // Worst-case PM state across this unit's active maintenance tasks.
  // "none" means no PMs are scheduled at all.
  pmState: EquipmentPmState;
  taskCount: number;
}

interface BucketDef {
  key: "overdue" | "due_soon" | "ok" | "inactive";
  title: string;
  tone: "rose" | "amber" | "slate" | "muted";
  match: (r: EquipmentRow) => boolean;
}

const BUCKETS: BucketDef[] = [
  {
    key: "overdue",
    title: "PM overdue",
    tone: "rose",
    match: (r) => r.active && r.pmState === "overdue",
  },
  {
    key: "due_soon",
    title: "Coming up",
    tone: "amber",
    match: (r) => r.active && r.pmState === "due_soon",
  },
  {
    key: "ok",
    title: "OK",
    tone: "slate",
    match: (r) => r.active && (r.pmState === "ok" || r.pmState === "none"),
  },
  {
    key: "inactive",
    title: "Inactive",
    tone: "muted",
    match: (r) => !r.active,
  },
];

const HEADER_CLASS: Record<BucketDef["tone"], string> = {
  rose: "bg-rose-50 text-rose-800 ring-rose-100",
  amber: "bg-amber-50 text-amber-800 ring-amber-100",
  slate: "bg-slate-50 text-slate-700 ring-slate-100",
  muted: "bg-slate-50 text-slate-500 ring-slate-100",
};

const BADGE_CLASS: Record<EquipmentPmState, string> = {
  overdue: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  ok: "bg-emerald-50 text-emerald-700",
  none: "bg-slate-100 text-slate-500",
};

const BADGE_LABEL: Record<EquipmentPmState, string> = {
  overdue: "PM due",
  due_soon: "Coming up",
  ok: "OK",
  none: "No PMs",
};

export default function EquipmentList({
  rows,
  components,
}: {
  rows: EquipmentRow[];
  components: Component[];
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [componentFilter, setComponentFilter] = useState<string | "all">("all");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const visible = useMemo(() => {
    const terms = debounced.split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (componentFilter !== "all" && r.componentId !== componentFilter) return false;
      if (terms.length > 0) {
        const hay = `${r.name} ${r.make ?? ""} ${r.model ?? ""} ${r.location_on_vessel ?? ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [rows, componentFilter, debounced]);

  const grouped = useMemo(() => {
    return BUCKETS.map((b) => ({
      def: b,
      rows: visible.filter(b.match),
    }));
  }, [visible]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search equipment…"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        />
        <select
          value={componentFilter}
          onChange={(e) => setComponentFilter(e.target.value as string | "all")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          <option value="all">All systems</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="ml-auto text-sm text-slate-500">
          {visible.length} of {rows.length}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 ring-1 ring-slate-100">
          No equipment matches.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ def, rows: groupRows }) => {
            if (groupRows.length === 0) return null;
            return (
              <section key={def.key} className="space-y-1">
                <div
                  className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ring-1 ${HEADER_CLASS[def.tone]}`}
                >
                  <span>{def.title}</span>
                  <span className="tabular-nums">{groupRows.length}</span>
                </div>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
                  {groupRows.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/equipment/${r.id}`}
                        className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">
                            {r.name}
                            {!r.active && (
                              <span className="ml-2 text-xs font-normal text-slate-400">
                                (inactive)
                              </span>
                            )}
                          </p>
                          <p className="truncate text-sm text-slate-500">
                            {[r.make, r.model].filter(Boolean).join(" ") || "—"}
                            {r.componentName && (
                              <span className="ml-1 text-slate-400">· {r.componentName}</span>
                            )}
                          </p>
                          {r.location_on_vessel && (
                            <p className="truncate text-xs text-slate-400">
                              {r.location_on_vessel}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 text-right">
                          <p className="text-sm font-semibold tabular-nums text-slate-900">
                            {r.current_hours != null ? r.current_hours : "—"}
                            <span className="ml-1 text-xs font-normal text-slate-400">hrs</span>
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE_CLASS[r.pmState]}`}
                          >
                            {BADGE_LABEL[r.pmState]}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
