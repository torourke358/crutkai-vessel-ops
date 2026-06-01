"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { YardTaskDocument } from "@/lib/types";

// Simple file-attachments widget for a yard task. No "kind" classification
// since yard task docs are usually quotes / receipts / photos pasted in.
export default function YardTaskAttachments({
  yardTaskId,
  initial,
}: {
  yardTaskId: string;
  initial: YardTaskDocument[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [docs, setDocs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not signed in.");
        return;
      }
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("yard-task-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const res = await fetch(`/api/yard-tasks/${yardTaskId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || null,
        }),
      });
      if (!res.ok) {
        setError("Couldn't record the attachment.");
        return;
      }
      const row = (await res.json()) as YardTaskDocument;
      setDocs((prev) => [row, ...prev]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function download(d: YardTaskDocument) {
    const { data } = await supabase.storage
      .from("yard-task-documents")
      .createSignedUrl(d.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(d: YardTaskDocument) {
    if (!confirm(`Delete "${d.file_name}"?`)) return;
    const res = await fetch(
      `/api/yard-tasks/${yardTaskId}/documents/${d.id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setError("Delete failed.");
      return;
    }
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
    router.refresh();
  }

  function fmt(n: number | null) {
    if (n == null) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Attachments ({docs.length})
        </p>
        <label className="flex cursor-pointer items-center justify-center rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700">
          {busy ? "Uploading…" : "+ Attach"}
          <input
            type="file"
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}
      {docs.length > 0 && (
        <ul className="space-y-1">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md bg-slate-800 px-2 py-1.5"
            >
              <button
                type="button"
                onClick={() => download(d)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-xs font-medium text-slate-100 hover:text-violet-300">
                  {d.file_name}
                </p>
                {d.file_size != null && (
                  <p className="text-[10px] text-slate-400">{fmt(d.file_size)}</p>
                )}
              </button>
              <button
                type="button"
                onClick={() => remove(d)}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-rose-300 hover:bg-rose-500/10"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
