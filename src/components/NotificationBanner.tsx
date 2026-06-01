"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface BannerItem {
  id: string;
  kind: string;
  subject: string;
  body: string;
}

// Persistent sticky banner under the header for unread "you need to act on
// this" notifications (inventory critical + maintenance overdue). Dismissing
// a row marks the notification read; the row reappears if a fresh alert of
// the same kind fires.
export default function NotificationBanner({
  initial,
}: {
  initial: BannerItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);

  if (items.length === 0) return null;

  async function dismiss(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    router.refresh();
  }

  return (
    <div className="border-b border-rose-200 bg-rose-50">
      <div className="mx-auto w-full max-w-5xl space-y-1 px-4 py-2">
        {items.map((i) => (
          <div
            key={i.id}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-rose-800">{i.subject}</p>
              <p className="truncate text-rose-700">{i.body}</p>
            </div>
            <button
              onClick={() => dismiss(i.id)}
              className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
