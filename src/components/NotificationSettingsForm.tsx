"use client";

import { useState } from "react";
import Link from "next/link";
import type { NotificationSettings } from "@/lib/types";

export default function NotificationSettingsForm({
  initial,
}: {
  initial: NotificationSettings;
}) {
  const [values, setValues] = useState({
    inventory_in_app: initial.inventory_in_app,
    inventory_email: initial.inventory_email,
    maintenance_in_app: initial.maintenance_in_app,
    maintenance_email: initial.maintenance_email,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/notifications/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save. Try again.");
      return;
    }
    setMessage("Saved.");
  }

  return (
    <div className="mx-auto max-w-md space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          Notification settings
        </h1>
        <Link href="/notifications" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <p className="text-sm text-slate-500">
        Choose which alerts to receive, and through which channels. Admins
        always see the in-app feed; email is opt-in.
      </p>

      <Group
        title="Inventory critical (stock below threshold)"
        inApp={values.inventory_in_app}
        email={values.inventory_email}
        onInApp={(v) => setValues((s) => ({ ...s, inventory_in_app: v }))}
        onEmail={(v) => setValues((s) => ({ ...s, inventory_email: v }))}
      />

      <Group
        title="Maintenance due / overdue"
        inApp={values.maintenance_in_app}
        email={values.maintenance_email}
        onInApp={(v) => setValues((s) => ({ ...s, maintenance_in_app: v }))}
        onEmail={(v) => setValues((s) => ({ ...s, maintenance_email: v }))}
      />

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {message && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function Group({
  title,
  inApp,
  email,
  onInApp,
  onEmail,
}: {
  title: string;
  inApp: boolean;
  email: boolean;
  onInApp: (v: boolean) => void;
  onEmail: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
        In-app bell + banner
        <input
          type="checkbox"
          checked={inApp}
          onChange={(e) => onInApp(e.target.checked)}
          className="h-5 w-5"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
        Email
        <input
          type="checkbox"
          checked={email}
          onChange={(e) => onEmail(e.target.checked)}
          className="h-5 w-5"
        />
      </label>
    </div>
  );
}
