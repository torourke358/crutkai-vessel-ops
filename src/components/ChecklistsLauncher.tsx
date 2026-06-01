"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChecklistTemplate } from "@/lib/types";

export default function ChecklistsLauncher({
  templates,
}: {
  templates: ChecklistTemplate[];
}) {
  const router = useRouter();
  const [pick, setPick] = useState(templates[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checklists/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: pick }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't start run.");
      return;
    }
    const row = (await res.json()) as { id: string };
    router.push(`/checklists/runs/${row.id}`);
  }

  if (templates.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 ring-1 ring-slate-100">
        No templates yet. Ask an admin to add one.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm"
      >
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
            {t.category ? ` · ${t.category}` : ""}
          </option>
        ))}
      </select>
      <button
        onClick={start}
        disabled={busy || !pick}
        className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {busy ? "Starting…" : "Start run"}
      </button>
      {error && <p className="w-full text-xs text-rose-600">{error}</p>}
    </div>
  );
}
