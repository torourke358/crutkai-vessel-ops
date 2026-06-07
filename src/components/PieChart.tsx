// Pure-CSS pie chart (conic-gradient) with a legend — no chart library.
// Server component: purely presentational. Always renders a ring (a neutral
// grey one when there's no data) so the chart is visibly present on the page
// rather than collapsing to a line of text.

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

export default function PieChart({
  slices,
  valueFormat = (n: number) => String(n),
  totalLabel = "Total",
  emptyLabel = "No data yet",
}: {
  slices: PieSlice[];
  valueFormat?: (n: number) => string;
  totalLabel?: string;
  emptyLabel?: string;
}) {
  const positive = slices.filter((s) => s.value > 0);
  const total = positive.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div
          className="h-44 w-44 shrink-0 rounded-full bg-slate-100 ring-1 ring-slate-200"
          role="img"
          aria-label={emptyLabel}
        />
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      </div>
    );
  }

  // conic-gradient stops via prefix sums — no mutable accumulator in render.
  const stops = positive.map((s, i) => {
    const before = positive.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    const start = (before / total) * 100;
    const end = ((before + s.value) / total) * 100;
    return `${s.color} ${start}% ${end}%`;
  });
  const gradient = `conic-gradient(${stops.join(", ")})`;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div
        className="h-44 w-44 shrink-0 rounded-full ring-1 ring-slate-200"
        style={{ background: gradient }}
        role="img"
        aria-label="Pie chart"
      />
      <ul className="w-full space-y-1.5">
        {positive.map((s) => {
          const pct = (s.value / total) * 100;
          return (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/5"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate text-slate-700">{s.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-500">
                {valueFormat(s.value)}
                <span className="ml-2 text-slate-400">{pct.toFixed(0)}%</span>
              </span>
            </li>
          );
        })}
        <li className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 text-sm font-medium">
          <span className="text-slate-700">{totalLabel}</span>
          <span className="tabular-nums text-slate-900">{valueFormat(total)}</span>
        </li>
      </ul>
    </div>
  );
}
