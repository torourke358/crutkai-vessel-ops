"use client";

import { useState } from "react";

// Circular % indicator. Click to open a slider; auto-saves on slider change.
export default function ProgressWheel({
  value,
  onChange,
  size = 80,
}: {
  value: number; // 0–100
  onChange: (next: number) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Progress: ${pct}%`}
        className="block focus:outline-none"
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#7c3aed"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 200ms ease" }}
          />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-slate-900 font-semibold"
            style={{ fontSize: size * 0.28 }}
          >
            {pct}%
          </text>
        </svg>
      </button>

      {open && (
        <div className="absolute left-1/2 z-20 mt-2 w-56 -translate-x-1/2 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-200">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>0%</span>
            <span className="font-medium text-slate-900">{pct}%</span>
            <span>100%</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="mt-2 w-full rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
