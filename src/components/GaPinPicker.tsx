"use client";

import { useRef } from "react";

// Click-to-pin widget. Renders /public/ga-schematic.svg, takes ga_x/ga_y
// as percentages (0..100), reports the new position when the user taps.
// Star button clears the pin. Designed for both mouse and touch.
export default function GaPinPicker({
  value,
  onChange,
}: {
  value: { x: number | null; y: number | null };
  onChange: (next: { x: number | null; y: number | null }) => void;
}) {
  const imgRef = useRef<HTMLDivElement>(null);

  function place(clientX: number, clientY: number) {
    const el = imgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    onChange({
      x: Math.min(100, Math.max(0, Number(x.toFixed(2)))),
      y: Math.min(100, Math.max(0, Number(y.toFixed(2)))),
    });
  }

  const hasPin = value.x != null && value.y != null;

  return (
    <div className="space-y-2">
      <div
        ref={imgRef}
        onClick={(e) => place(e.clientX, e.clientY)}
        className="relative cursor-crosshair overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200"
        style={{ aspectRatio: "1000 / 520" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ga-schematic.svg"
          alt="GA schematic"
          className="block h-full w-full select-none"
          draggable={false}
        />
        {hasPin && (
          <div
            className="pointer-events-none absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: `${value.x}%`, top: `${value.y}%` }}
          >
            <span className="h-3 w-3 rounded-full bg-violet-600 ring-2 ring-white shadow" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {hasPin
            ? `Pinned at ${value.x?.toFixed(1)}% × ${value.y?.toFixed(1)}%`
            : "Tap the schematic to pin this unit."}
        </span>
        {hasPin && (
          <button
            type="button"
            onClick={() => onChange({ x: null, y: null })}
            className="rounded-md px-2 py-1 font-medium text-rose-600 hover:bg-rose-50"
          >
            Clear pin
          </button>
        )}
      </div>
    </div>
  );
}
