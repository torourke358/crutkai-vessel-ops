"use client";

import { useMemo, useState } from "react";

export interface PartsAvailable {
  id: string;
  part_name: string;
  part_number: string | null;
  quantity: number;
  unit: string;
}

export interface PartsRow {
  inventory_item_id: string;
  qty_used: number;
}

export default function PartsConsumedPicker({
  available,
  rows,
  onChange,
}: {
  available: PartsAvailable[];
  rows: PartsRow[];
  onChange: (next: PartsRow[]) => void;
}) {
  const [search, setSearch] = useState("");

  const byId = useMemo(
    () => new Map(available.map((a) => [a.id, a] as const)),
    [available],
  );

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available.slice(0, 8);
    return available
      .filter((a) => {
        if (rows.some((r) => r.inventory_item_id === a.id)) return false;
        const hay = `${a.part_name} ${a.part_number ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [available, search, rows]);

  function addRow(itemId: string) {
    if (rows.some((r) => r.inventory_item_id === itemId)) return;
    const item = byId.get(itemId);
    if (!item) return;
    onChange([...rows, { inventory_item_id: itemId, qty_used: 1 }]);
    setSearch("");
  }

  function updateQty(itemId: string, qty: number) {
    onChange(
      rows.map((r) =>
        r.inventory_item_id === itemId ? { ...r, qty_used: qty } : r,
      ),
    );
  }

  function removeRow(itemId: string) {
    onChange(rows.filter((r) => r.inventory_item_id !== itemId));
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Add parts consumed
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search inventory…"
          className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        {filteredAvailable.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-100">
            {filteredAvailable.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 p-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">
                    {a.part_name}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {a.part_number ?? "—"} · on hand: {a.quantity} {a.unit}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addRow(a.id)}
                  className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => {
            const item = byId.get(r.inventory_item_id);
            const overdraw = item != null && r.qty_used > item.quantity;
            return (
              <li
                key={r.inventory_item_id}
                className="flex items-center justify-between gap-3 rounded-xl bg-white p-2 ring-1 ring-slate-100"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">
                    {item?.part_name ?? "Unknown"}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    on hand: {item?.quantity ?? "—"} {item?.unit ?? ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={item?.quantity ?? undefined}
                    step={1}
                    value={r.qty_used}
                    onChange={(e) =>
                      updateQty(
                        r.inventory_item_id,
                        Math.max(1, Number(e.target.value || 1)),
                      )
                    }
                    className={`w-20 rounded-lg border px-2 py-1 text-right text-sm tabular-nums ${
                      overdraw
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : "border-slate-200 text-slate-700"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(r.inventory_item_id)}
                    aria-label="Remove"
                    className="rounded-md px-2 text-lg leading-none text-slate-400 hover:text-rose-700"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
