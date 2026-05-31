"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";

// Circular bell + small date label. Click to open a date input.
export default function ReminderWheel({
  value,
  onChange,
  size = 80,
}: {
  value: string | null; // YYYY-MM-DD
  onChange: (next: string | null) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const has = !!value;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={value ? `Reminder ${value}` : "Set reminder"}
        style={{
          width: size,
          height: size,
          backgroundColor: has ? "#fbbf24" : "#e2e8f0",
          color: has ? "white" : "#475569",
        }}
        className="flex flex-col items-center justify-center rounded-full font-medium shadow-sm ring-2 ring-white hover:opacity-90"
      >
        <svg viewBox="0 0 24 24" width={size * 0.32} height={size * 0.32} fill="none" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {has && (
          <span style={{ fontSize: size * 0.14 }} className="mt-0.5 leading-none">
            {formatDate(value).split(" ").slice(0, 2).join(" ")}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-1/2 z-20 mt-2 w-56 -translate-x-1/2 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
          <label className="block text-xs font-medium text-slate-500">
            Reminder date
          </label>
          <input
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <div className="mt-2 flex items-center justify-between">
            {value && (
              <button
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-xs font-medium text-rose-600"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="ml-auto rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
