"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Component } from "@/lib/types";

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
}

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

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">
            No equipment matches.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((r) => (
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
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                      {r.current_hours != null ? r.current_hours : "—"}
                      <span className="ml-1 text-xs font-normal text-slate-400">hrs</span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
