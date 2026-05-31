"use client";

import { useMemo, useState } from "react";
import type { Component } from "@/lib/types";
import { MAX_INVENTORY_COMPONENTS } from "@/lib/types";

// Chip-based multi-select for inventory_items.component_ids. Caps at 8.
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
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = useMemo(
    () => components.filter((c) => value.includes(c.id)),
    [components, value],
  );
  const available = useMemo(
    () => components.filter((c) => !value.includes(c.id)),
    [components, value],
  );

  const atMax = value.length >= MAX_INVENTORY_COMPONENTS;

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }
  function add(id: string) {
    if (atMax) return;
    onChange([...value, id]);
    setPickerOpen(false);
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
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 ${compact ? "text-xs" : "text-sm"} font-medium text-slate-600 hover:bg-slate-200`}
            >
              + Add
            </button>
            {pickerOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-48 overflow-y-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
                {available.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-slate-400">
                    All components added.
                  </p>
                ) : (
                  available.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => add(c.id)}
                      className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      {c.name}
                    </button>
                  ))
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
