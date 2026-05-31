"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage } from "@/lib/image";

// Photo widget for an inventory item's storage location. Uploads to the
// `inventory-photos` bucket under {user_id}/{uuid}.jpg per the RLS policy.
//
// Controlled: `value` is the storage path; `onChange` is called with the
// new path (or null on remove). Shows a signed-URL thumbnail when value
// is set, plus take-photo / library / remove buttons.
export default function InventoryPhotoCapture({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSignedUrl(null);
      return;
    }
    (async () => {
      const { data } = await supabase.storage
        .from("inventory-photos")
        .createSignedUrl(value, 300);
      if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [value, supabase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not signed in.");
        return;
      }
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("inventory-photos")
        .upload(path, prepared, { contentType: "image/jpeg" });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      onChange(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {value && signedUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrl}
            alt="Location"
            className="w-full max-h-72 rounded-2xl object-cover ring-1 ring-slate-200"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-rose-700 shadow ring-1 ring-rose-200 hover:bg-white"
          >
            Remove photo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-700">
            {busy ? "Reading…" : "Take photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <label className="flex cursor-pointer items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            {busy ? "Reading…" : "Choose from library"}
            <input
              type="file"
              accept="image/*"
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
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
