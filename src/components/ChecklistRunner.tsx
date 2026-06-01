"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ChecklistRun,
  ChecklistRunItem,
  ChecklistTemplateItem,
} from "@/lib/types";

export default function ChecklistRunner({
  run,
  templateItems,
  runItems,
}: {
  run: ChecklistRun;
  templateItems: ChecklistTemplateItem[];
  runItems: ChecklistRunItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(runItems);
  const [notes, setNotes] = useState(run.notes ?? "");
  const [busy, setBusy] = useState(false);

  const itemByTplId = new Map(items.map((i) => [i.template_item_id, i]));

  async function toggle(templateItemId: string, checked: boolean) {
    const runItem = itemByTplId.get(templateItemId);
    if (!runItem) return;
    setItems((prev) =>
      prev.map((it) => (it.id === runItem.id ? { ...it, checked } : it)),
    );
    await fetch(`/api/checklists/runs/${run.id}/items/${runItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked }),
    });
    router.refresh();
  }

  async function saveNotes() {
    await fetch(`/api/checklists/runs/${run.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes.trim() || null }),
    });
  }

  async function complete() {
    setBusy(true);
    await fetch(`/api/checklists/runs/${run.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complete: true, notes: notes.trim() || null }),
    });
    setBusy(false);
    router.refresh();
  }

  const total = templateItems.length;
  const done = items.filter((i) => i.checked).length;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
        <p className="text-sm text-slate-700">
          Progress:{" "}
          <span className="font-semibold tabular-nums text-slate-900">
            {done}/{total}
          </span>
        </p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-violet-500 transition-all"
            style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
          />
        </div>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {templateItems.map((ti) => {
          const ri = itemByTplId.get(ti.id);
          const checked = ri?.checked ?? false;
          return (
            <li key={ti.id} className="p-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => void toggle(ti.id, e.target.checked)}
                  disabled={!!run.completed_at}
                  className="mt-1 h-4 w-4"
                />
                <span
                  className={`text-sm ${
                    checked ? "text-slate-400 line-through" : "text-slate-900"
                  }`}
                >
                  {ti.body}
                  {ti.required && (
                    <span className="ml-1 text-xs text-rose-500">*</span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-500">
          Run notes
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          disabled={!!run.completed_at}
          className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          placeholder="Anything noted during the run…"
        />
      </div>

      {!run.completed_at && (
        <button
          onClick={complete}
          disabled={busy}
          className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? "Completing…" : "Mark run complete"}
        </button>
      )}
    </div>
  );
}
