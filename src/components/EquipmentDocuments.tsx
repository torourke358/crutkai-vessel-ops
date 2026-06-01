"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EQUIPMENT_DOCUMENT_KIND_LABELS,
  type EquipmentDocument,
  type EquipmentDocumentKind,
} from "@/lib/types";

// Per-equipment document list. Admin uploads PDFs / drawings / data sheets
// straight to the equipment-documents bucket, then we record a metadata row.
// Crew + admin can download via signed URL; admin can delete.
export default function EquipmentDocuments({
  equipmentId,
  initial,
  isAdmin,
}: {
  equipmentId: string;
  initial: EquipmentDocument[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [docs, setDocs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<EquipmentDocumentKind>("manual");

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
      // Preserve the extension so the file opens with the right app.
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("equipment-documents")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }

      const res = await fetch(`/api/equipment/${equipmentId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || null,
        }),
      });
      if (!res.ok) {
        setError("Couldn't record the document.");
        return;
      }
      const row = (await res.json()) as EquipmentDocument;
      setDocs((prev) => [row, ...prev]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function download(doc: EquipmentDocument) {
    const { data } = await supabase.storage
      .from("equipment-documents")
      .createSignedUrl(doc.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(doc: EquipmentDocument) {
    if (!confirm(`Delete "${doc.file_name}"? This can't be undone.`)) return;
    const res = await fetch(
      `/api/equipment/${equipmentId}/documents/${doc.id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setError("Delete failed.");
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    router.refresh();
  }

  function formatSize(n: number | null) {
    if (n == null) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EquipmentDocumentKind)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            {(
              Object.entries(EQUIPMENT_DOCUMENT_KIND_LABELS) as [
                EquipmentDocumentKind,
                string,
              ][]
            ).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center justify-center rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700">
            {busy ? "Uploading…" : "Add document"}
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
      )}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {docs.length === 0 ? (
          <li className="p-4 text-center text-sm text-slate-400">
            No documents yet.
          </li>
        ) : (
          docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 p-3">
              <button
                type="button"
                onClick={() => download(d)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-slate-900 hover:text-violet-700">
                  {d.file_name}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {EQUIPMENT_DOCUMENT_KIND_LABELS[d.kind]}
                  {d.file_size != null && (
                    <span className="ml-1">· {formatSize(d.file_size)}</span>
                  )}
                </p>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => remove(d)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
