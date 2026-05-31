"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Component } from "@/lib/types";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  computeStatus,
  type InventoryStatus,
} from "@/lib/inventory";

export interface InventoryRow {
  id: string;
  part_name: string;
  part_number: string | null;
  make: string | null;
  quantity: number;
  unit: string;
  location: string | null;
  notes: string | null;
  critical_threshold: number | null;
  componentIds: string[];
  hasPhoto: boolean;
}

const STATUS_FILTERS: { id: "all" | InventoryStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "no_stock", label: "No stock" },
  { id: "ok", label: "OK" },
];

export default function InventoryList({
  rows,
  components,
  isAdmin,
}: {
  rows: InventoryRow[];
  components: Component[];
  isAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [componentFilter, setComponentFilter] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["id"]>("all");
  const [locationFilter, setLocationFilter] = useState<string | "all">("all");

  // Debounce the search box (300ms) — matches petty cash.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.location) set.add(r.location);
    return [...set].sort();
  }, [rows]);

  const visible = useMemo(() => {
    const terms = debounced.split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (componentFilter !== "all" && !r.componentIds.includes(componentFilter)) return false;
      if (locationFilter !== "all" && r.location !== locationFilter) return false;
      if (statusFilter !== "all") {
        if (computeStatus(r.quantity, r.critical_threshold) !== statusFilter) return false;
      }
      if (terms.length > 0) {
        const hay = `${r.part_name} ${r.part_number ?? ""} ${r.make ?? ""} ${r.location ?? ""} ${r.notes ?? ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [rows, componentFilter, statusFilter, locationFilter, debounced]);

  const counts = useMemo(() => {
    const c = { critical: 0, no_stock: 0, ok: 0 };
    for (const r of rows) c[computeStatus(r.quantity, r.critical_threshold)]++;
    return c;
  }, [rows]);

  return (
    <div className="space-y-3">
      {/* Status summary */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <SummaryCell label="No stock" value={counts.no_stock} tone="rose" />
        <SummaryCell label="Critical" value={counts.critical} tone="amber" />
        <SummaryCell label="OK" value={counts.ok} tone="emerald" />
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search part name, number, make, location, notes…"
          className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 text-lg leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={componentFilter}
          onChange={(e) => setComponentFilter(e.target.value as string | "all")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          <option value="all">All components</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value as string | "all")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          <option value="all">All locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={`px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-violet-600 text-white" : "bg-white text-slate-600"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto text-sm text-slate-500">
          {visible.length} of {rows.length}
        </div>
      </div>

      {/* Rows */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">
            No items match the current filters.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((r) => {
              const status = computeStatus(r.quantity, r.critical_threshold);
              const linkProps = isAdmin
                ? { href: `/inventory/${r.id}` }
                : { href: `/inventory/${r.id}`, "aria-disabled": true };
              return (
                <li key={r.id}>
                  <Link
                    {...linkProps}
                    className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">
                        {r.part_name}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {[r.make, r.part_number].filter(Boolean).join(" · ") || "—"}
                        {r.componentIds.length > 0 && (
                          <span className="ml-1 text-slate-400">
                            · {componentNamesFor(r.componentIds, components)}
                          </span>
                        )}
                      </p>
                      {(r.location || r.hasPhoto) && (
                        <p className="truncate text-xs text-slate-400">
                          {r.hasPhoto && <span className="mr-1">📷</span>}
                          {r.location}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        {r.quantity}{" "}
                        <span className="text-xs font-normal text-slate-400">
                          {r.unit}
                        </span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                      {r.critical_threshold != null && (
                        <span className="text-[10px] text-slate-400">
                          threshold {r.critical_threshold}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function componentNamesFor(ids: string[], components: Component[]): string {
  if (ids.length === 0) return "";
  const byId = new Map(components.map((c) => [c.id, c.name] as const));
  const names = ids.map((id) => byId.get(id)).filter(Boolean) as string[];
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "rose" | "amber" | "emerald";
}) {
  const colors: Record<string, string> = {
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className={`rounded-xl px-3 py-2 ${colors[tone]}`}>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
