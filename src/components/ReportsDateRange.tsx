"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Date range picker for /reports. Two native date inputs + Apply.
// Defaults to last 30 days when no params are set.
export default function ReportsDateRange({
  initialFrom,
  initialTo,
}: {
  initialFrom: string;
  initialTo: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  function apply() {
    const next = new URLSearchParams(params.toString());
    next.set("from", from);
    next.set("to", to);
    router.push(`/reports?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
          From
        </label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
          To
        </label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={apply}
        className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
      >
        Apply
      </button>
    </div>
  );
}
