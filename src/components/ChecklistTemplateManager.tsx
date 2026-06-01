"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChecklistTemplate, ChecklistTemplateItem } from "@/lib/types";

// Admin tool: create new checklist templates by typing a title + list of items
// (one per line). Existing templates render as read-only summaries below.
// Editing existing template items isn't built yet — admin can deactivate an
// old template and create a replacement.
export default function ChecklistTemplateManager({
  initialTemplates,
  initialItems,
}: {
  initialTemplates: ChecklistTemplate[];
  initialItems: ChecklistTemplateItem[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsByTpl = new Map<string, ChecklistTemplateItem[]>();
  for (const it of initialItems) {
    const arr = itemsByTpl.get(it.template_id) ?? [];
    arr.push(it);
    itemsByTpl.set(it.template_id, arr);
  }

  async function create() {
    if (!title.trim()) {
      setError("Title required.");
      return;
    }
    const lines = itemsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError("Add at least one item (one per line).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checklists/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        items: lines.map((body) => ({ body, required: true })),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Save failed.");
      return;
    }
    setTitle("");
    setCategory("");
    setDescription("");
    setItemsText("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
        <p className="text-sm font-semibold text-slate-900">New template</p>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Engine start)"
          className="block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (optional — e.g. Engineering)"
          className="block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
        <textarea
          rows={6}
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          placeholder={"Items, one per line:\nCheck oil level\nCheck coolant\nVerify shore power off"}
          className="block w-full rounded-md border border-slate-200 px-3 py-1.5 font-mono text-sm"
        />
        <button
          onClick={create}
          disabled={busy}
          className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save template"}
        </button>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {initialTemplates.length === 0 ? (
          <li className="p-4 text-center text-sm text-slate-400">
            No templates yet.
          </li>
        ) : (
          initialTemplates.map((t) => {
            const its = itemsByTpl.get(t.id) ?? [];
            return (
              <li key={t.id} className="space-y-1 p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {t.title}
                  {t.category && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      · {t.category}
                    </span>
                  )}
                  {!t.active && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      (inactive)
                    </span>
                  )}
                </p>
                {t.description && (
                  <p className="text-xs text-slate-500">{t.description}</p>
                )}
                <ol className="ml-4 list-decimal text-xs text-slate-600">
                  {its.map((it) => (
                    <li key={it.id}>{it.body}</li>
                  ))}
                </ol>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
