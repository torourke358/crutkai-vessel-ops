"use client";

import type { YardTaskEffort } from "@/lib/types";

// 3-segment circular dial (S / M / L). Each segment is a pie slice.
// Tap a segment to set; current selection is highlighted.
const ORDER: YardTaskEffort[] = ["S", "M", "L"];
const LABEL: Record<YardTaskEffort, string> = { S: "S", M: "M", L: "L" };
const COLOR: Record<YardTaskEffort, string> = {
  S: "#34d399", // emerald-400
  M: "#fbbf24", // amber-400
  L: "#fb7185", // rose-400
};

export default function EffortWheel({
  value,
  onChange,
  size = 80,
}: {
  value: YardTaskEffort | null;
  onChange: (next: YardTaskEffort | null) => void;
  size?: number;
}) {
  const r = size / 2;
  const cx = r;
  const cy = r;

  // 3 equal arcs at 0, 120, 240 degrees (each 120 wide). Start at top.
  function arcPath(startDeg: number, endDeg: number): string {
    const startRad = ((startDeg - 90) * Math.PI) / 180;
    const endRad = ((endDeg - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }

  function labelPos(centerDeg: number): { x: number; y: number } {
    const labelR = r * 0.62;
    const rad = ((centerDeg - 90) * Math.PI) / 180;
    return { x: cx + labelR * Math.cos(rad), y: cy + labelR * Math.sin(rad) };
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="cursor-pointer"
    >
      {ORDER.map((seg, i) => {
        const startDeg = i * 120;
        const endDeg = (i + 1) * 120;
        const active = value === seg;
        const labelXY = labelPos(startDeg + 60);
        return (
          <g
            key={seg}
            onClick={() => onChange(active ? null : seg)}
          >
            <path
              d={arcPath(startDeg, endDeg)}
              fill={active ? COLOR[seg] : "#f1f5f9"}
              stroke="white"
              strokeWidth={2}
              opacity={active ? 1 : 0.6}
            />
            <text
              x={labelXY.x}
              y={labelXY.y}
              textAnchor="middle"
              dominantBaseline="central"
              className={`pointer-events-none font-bold ${active ? "fill-white" : "fill-slate-500"}`}
              style={{ fontSize: size * 0.18 }}
            >
              {LABEL[seg]}
            </text>
          </g>
        );
      })}
      {/* Center hole for visual focus */}
      <circle cx={cx} cy={cy} r={r * 0.22} fill="white" />
    </svg>
  );
}
