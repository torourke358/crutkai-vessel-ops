"use client";

import { useState } from "react";
import type { UserProfile } from "@/lib/types";

// Circular avatar with initial. Click to pick from the user list.
function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// Deterministic hue from a string so each owner gets a stable color.
function hueFor(s: string | null): number {
  if (!s) return 220;
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

export default function OwnerWheel({
  ownerId,
  users,
  onChange,
  size = 80,
}: {
  ownerId: string | null;
  users: Pick<UserProfile, "id" | "full_name">[];
  onChange: (next: string | null) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const owner = users.find((u) => u.id === ownerId);
  const hue = hueFor(owner?.id ?? null);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={owner?.full_name ?? "Choose owner"}
        style={{
          width: size,
          height: size,
          backgroundColor: owner ? `hsl(${hue}, 60%, 55%)` : "#e2e8f0",
          color: owner ? "white" : "#475569",
        }}
        className="flex items-center justify-center rounded-full text-2xl font-bold ring-2 ring-white shadow-sm hover:opacity-90"
      >
        {owner ? initials(owner.full_name) : "?"}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-52 rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100"
          >
            (unassigned)
          </button>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onChange(u.id);
                setOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              {u.full_name ?? u.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
