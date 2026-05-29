"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

interface Item {
  id: string;
  kind: string;
  subject: string;
  body: string;
  related_type: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { items: Item[]; unread: number };
      setItems(json.items);
      setUnread(json.unread);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    // Initial fetch + 30s polling. Outside React's "external system" model
    // but it's the simplest viable approach for v1; rule disabled with intent.
    /* eslint-disable react-hooks/set-state-in-effect */
    void load();
    const t = setInterval(load, 30_000);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, read_at: new Date().toISOString() } : i)),
    );
    setUnread((u) => Math.max(0, u - 1));
    router.refresh();
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1 text-slate-500 hover:text-violet-700"
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <Link
              href="/notifications"
              className="text-xs font-medium text-violet-700"
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 ? (
              <li className="p-4 text-center text-sm text-slate-400">
                Nothing yet.
              </li>
            ) : (
              items.slice(0, 10).map((i) => (
                <li
                  key={i.id}
                  className={`p-3 ${i.read_at ? "" : "bg-violet-50/50"}`}
                >
                  <button
                    onClick={() => {
                      if (!i.read_at) void markRead(i.id);
                    }}
                    className="block w-full text-left"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {i.subject}
                    </p>
                    <p className="text-xs text-slate-500">{i.body}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatDate(i.created_at.slice(0, 10))}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
