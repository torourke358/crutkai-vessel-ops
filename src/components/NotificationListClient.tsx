"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Item {
  id: string;
  kind: string;
  subject: string;
  body: string;
  related_type: string | null;
  related_id: string | null;
  read_at: string | null;
  createdLabel: string;
}

const KIND_LABELS: Record<string, string> = {
  inventory_critical: "Inventory critical",
  maintenance_due: "Maintenance due",
  maintenance_overdue: "Maintenance overdue",
};

export default function NotificationListClient({ items: initial }: { items: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);

  const unread = items.filter((i) => !i.read_at).length;

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, read_at: new Date().toISOString() } : i,
      ),
    );
    router.refresh();
  }

  async function markAllRead() {
    setBusy(true);
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    setItems((prev) =>
      prev.map((i) => (i.read_at ? i : { ...i, read_at: new Date().toISOString() })),
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{unread} unread</span>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            disabled={busy}
            className="font-medium text-violet-700 disabled:opacity-60"
          >
            Mark all read
          </button>
        )}
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {items.length === 0 ? (
          <li className="p-6 text-center text-sm text-slate-400">
            No notifications yet.
          </li>
        ) : (
          items.map((i) => (
            <li
              key={i.id}
              className={`p-3 ${i.read_at ? "" : "bg-violet-50/40"}`}
            >
              <button
                onClick={() => {
                  if (!i.read_at) void markRead(i.id);
                }}
                className="block w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {i.subject}
                    </p>
                    <p className="text-sm text-slate-500">{i.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {KIND_LABELS[i.kind] ?? i.kind} · {i.createdLabel}
                    </p>
                  </div>
                  {!i.read_at && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-600" />
                  )}
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
