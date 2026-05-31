"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Component } from "@/lib/types";
import { MAX_INVENTORY_COMPONENTS } from "@/lib/types";

// Chip-based multi-select for inventory_items.component_ids. Caps at 8.
// Lets the user type a new component name in the picker's bottom field
// to create it on the fly via POST /api/components.
export default function ComponentMultiSelect({
  value,
  onChange,
  components,
  compact = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  components: Component[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Close the picker when a click lands outside the wrapper.
  useEffect(() => {
    if (!pickerOpen) return;
    function onDown(e: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pickerOpen]);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Local mirror so a newly-created component shows up in the picker
  // immediately, before router.refresh() round-trips.
  const [localComponents, setLocalComponents] = useState<Component[]>(components);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLocalComponents(components);
  }, [components]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selected = useMemo(
    () => localComponents.filter((c) => value.includes(c.id)),
    [localComponents, value],
  );
  const available = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return localComponents
      .filter((c) => !value.includes(c.id))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true));
  }, [localComponents, value, filter]);

  const atMax = value.length >= MAX_INVENTORY_COMPONENTS;
  const filterMatchesExisting = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return false;
    return localComponents.some((c) => c.name.toLowerCase() === q);
  }, [filter, localComponents]);
  const showCreateOption =
    filter.trim().length > 0 && !filterMatchesExisting && !atMax;

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }
  function add(id: string) {
    if (atMax) return;
    onChange([...value, id]);
    setFilter("");
    setPickerOpen(false);
  }

  async function createNew() {
    const name = filter.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setCreateError("Couldn't add that component.");
        return;
      }
      const created = (await res.json()) as Component;
      setLocalComponents((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created],
      );
      if (!value.includes(created.id) && value.length < MAX_INVENTORY_COMPONENTS) {
        onChange([...value, created.id]);
      }
      setFilter("");
      setPickerOpen(false);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.length === 0 && (
          <span className={`text-${compact ? "xs" : "sm"} text-slate-400`}>
            None
          </span>
        )}
        {selected.map((c) => (
          <span
            key={c.id}
            className={`inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 ${compact ? "text-xs" : "text-sm"} font-medium text-violet-800`}
          >
            {c.name}
            <button
              type="button"
              onClick={() => remove(c.id)}
              aria-label={`Remove ${c.name}`}
              className="-mr-0.5 ml-0.5 rounded-full text-violet-700 hover:bg-violet-200 hover:text-violet-900"
            >
              <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3l8 8M11 3l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}

        {!atMax && (
          <div className="relative inline-block" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 ${compact ? "text-xs" : "text-sm"} font-medium text-slate-600 hover:bg-slate-200`}
            >
              + Add
            </button>
            {pickerOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200">
                <input
                  autoFocus
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search or type a new name…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (available.length > 0) {
                        e.preventDefault();
                        add(available[0].id);
                      } else if (showCreateOption) {
                        e.preventDefault();
                        void createNew();
                      }
                    } else if (e.key === "Escape") {
                      setPickerOpen(false);
                    }
                  }}
                  className="block w-full border-b border-slate-100 px-3 py-2 text-sm outline-none focus:bg-slate-50"
                />
                <div className="max-h-60 overflow-y-auto p-1">
                  {available.length === 0 && !showCreateOption && (
                    <p className="px-2 py-2 text-xs text-slate-400">
                      No matches.
                    </p>
                  )}
                  {available.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => add(c.id)}
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      {c.name}
                    </button>
                  ))}
                  {showCreateOption && (
                    <button
                      type="button"
                      onClick={() => void createNew()}
                      disabled={creating}
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-60"
                    >
                      {creating ? "Adding…" : `+ Add "${filter.trim()}" as new component`}
                    </button>
                  )}
                </div>
                {createError && (
                  <p className="border-t border-slate-100 px-3 py-2 text-xs text-rose-700">
                    {createError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {atMax && (
          <span className="text-xs text-slate-400">
            Max {MAX_INVENTORY_COMPONENTS} components
          </span>
        )}
      </div>
    </div>
  );
}
