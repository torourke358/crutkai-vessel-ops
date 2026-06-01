"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage } from "@/lib/image";

// Multi-photo widget. Same upload pattern as PhotoCapture but stores an
// ordered array of storage paths. First photo in the array is treated as
// the hero by the equipment detail page; the others render as a strip.
export default function PhotoGallery({
  values,
  onChange,
  bucket,
  max = 12,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  bucket: string;
  max?: number;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = values.filter((p) => !(p in urls));
      if (pending.length === 0) return;
      const fresh: Record<string, string> = {};
      for (const p of pending) {
        const { data } = await supabase.storage
          .from(bucket)
          .createSignedUrl(p, 300);
        if (data?.signedUrl) fresh[p] = data.signedUrl;
      }
      if (!cancelled && Object.keys(fresh).length > 0) {
        setUrls((prev) => ({ ...prev, ...fresh }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [values, bucket, supabase, urls]);

  async function handleFile(file: File) {
    if (values.length >= max) {
      setError(`Max ${max} photos.`);
      return;
    }
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
        .from(bucket)
        .upload(path, prepared, { contentType: "image/jpeg" });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      onChange([...values, path]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read image.");
    } finally {
      setBusy(false);
    }
  }

  function remove(path: string) {
    onChange(values.filter((p) => p !== path));
  }

  function makeHero(path: string) {
    if (values[0] === path) return;
    onChange([path, ...values.filter((p) => p !== path)]);
  }

  const atMax = values.length >= max;

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {values.map((path, i) => (
            <div key={path} className="relative">
              {urls[path] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={urls[path]}
                  alt={`Equipment photo ${i + 1}`}
                  className="aspect-square w-full rounded-xl object-cover ring-1 ring-slate-200"
                />
              ) : (
                <div className="aspect-square w-full animate-pulse rounded-xl bg-slate-100 ring-1 ring-slate-200" />
              )}
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Hero
                </span>
              )}
              <div className="absolute right-1 top-1 flex gap-1">
                {i !== 0 && (
                  <button
                    type="button"
                    onClick={() => makeHero(path)}
                    aria-label="Make hero photo"
                    className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-white"
                  >
                    ★
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(path)}
                  aria-label="Remove photo"
                  className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-white"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!atMax && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-700">
            {busy ? "Uploading…" : "Take photo"}
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
            {busy ? "Uploading…" : "Choose from library"}
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

      {atMax && (
        <p className="text-xs text-slate-400">
          Max {max} photos reached. Remove one to add another.
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
