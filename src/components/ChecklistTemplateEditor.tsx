"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChecklistTemplate, ChecklistTemplateItem } from "@/lib/types";

// Per-template editor. Rename / recategorize the template; add / remove /
// rename / reorder its items. Existing runs reference a snapshot copy via
// checklist_run_items so this is safe.
export default function ChecklistTemplateEditor({
  template,
  initialItems,
}: {
  template: ChecklistTemplate;
  initialItems: ChecklistTemplateItem[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(template.title);
  const [category, setCategory] = useState(template.category ?? "");
  const [description, setDescription] = useState(template.description ?? "");
  const [active, setActive] = useState(template.active);
  const [items, setItems] = useState(initialItems);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newBody, setNewBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTemplate(patch: Partial<ChecklistTemplate>) {
    setError(null);
    const res = await fetch(`/api/checklists/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setError("Save failed.");
      return;
    }
    router.refresh();
  }

  async function patchItem(id: string, patch: Partial<ChecklistTemplateItem>) {
    const res = await fetch(
      `/api/checklists/templates/${template.id}/items/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) {
      setError("Save failed.");
      return null;
    }
    const next = (await res.json()) as ChecklistTemplateItem;
    setItems((prev) =>
      prev
        .map((it) => (it.id === id ? next : it))
        .sort((a, b) => a.display_order - b.display_order),
    );
    return next;
  }

  async function rename(id: string) {
    const current = items.find((i) => i.id === id);
    const draft = drafts[id];
    if (!current || draft == null || draft.trim() === "" || draft === current.body) {
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      return;
    }
    await patchItem(id, { body: draft.trim() });
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  async function move(id: string, dir: -1 | 1) {
    const sorted = [...items].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((i) => i.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swap];
    await patchItem(a.id, { display_order: b.display_order });
    await patchItem(b.id, { display_order: a.display_order });
  }

  async function remove(id: string) {
    if (!confirm("Delete this item?")) return;
    const res = await fetch(
      `/api/checklists/templates/${template.id}/items/${id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setError("Delete failed.");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    router.refresh();
  }

  async function addItem() {
    if (!newBody.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/checklists/templates/${template.id}/items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newBody.trim(), required: true }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't add item.");
      return;
    }
    const row = (await res.json()) as ChecklistTemplateItem;
    setItems((prev) =>
      [...prev, row].sort((a, b) => a.display_order - b.display_order),
    );
    setNewBody("");
    router.refresh();
  }

  const sorted = [...items].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Template
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== template.title && saveTemplate({ title: title.trim() })}
          className="block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold"
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={() =>
            category.trim() !== (template.category ?? "") &&
            saveTemplate({ category: category.trim() || null })
          }
          placeholder="Category (optional)"
          className="block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() =>
            description.trim() !== (template.description ?? "") &&
            saveTemplate({ description: description.trim() || null })
          }
          placeholder="Description (optional)"
          className="block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => {
              setActive(e.target.checked);
              void saveTemplate({ active: e.target.checked });
            }}
            className="h-4 w-4"
          />
          Active (visible to crew on /checklists)
        </label>
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Items
        </p>
        <ul className="space-y-1">
          {sorted.map((it, i) => {
            const draft = drafts[it.id];
            return (
              <li
                key={it.id}
                className="flex items-center gap-2 rounded-md bg-slate-50 p-2"
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => void move(it.id, -1)}
                    disabled={i === 0}
                    className="text-xs text-slate-400 hover:text-violet-700 disabled:opacity-40"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(it.id, 1)}
                    disabled={i === sorted.length - 1}
                    className="text-xs text-slate-400 hover:text-violet-700 disabled:opacity-40"
                  >
                    ▼
                  </button>
                </div>
                <input
                  value={draft ?? it.body}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [it.id]: e.target.value }))
                  }
                  onBlur={() => void rename(it.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                  }}
                  className="flex-1 rounded-md border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-violet-400 focus:bg-white focus:outline-none"
                />
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={it.required}
                    onChange={(e) => void patchItem(it.id, { required: e.target.checked })}
                    className="h-3 w-3"
                  />
                  req
                </label>
                <button
                  type="button"
                  onClick={() => void remove(it.id)}
                  className="rounded-md px-1.5 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-1">
          <input
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addItem();
            }}
            placeholder="Add a new item…"
            className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => void addItem()}
            disabled={busy || !newBody.trim()}
            className="rounded-md bg-violet-600 px-2 py-1 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
