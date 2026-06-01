import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import CommentsThread from "@/components/CommentsThread";
import DefectStatusControls from "@/components/DefectStatusControls";
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  type Defect,
  type DefectComment,
  type Equipment,
  type UserProfile,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DefectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: defect }, { data: comments }, { data: users }, { data: equipment }] =
    await Promise.all([
      supabase.from("defects").select().eq("id", id).single<Defect>(),
      supabase
        .from("defect_comments")
        .select()
        .eq("defect_id", id)
        .order("created_at", { ascending: true })
        .returns<DefectComment[]>(),
      supabase
        .from("user_profiles")
        .select("id, full_name")
        .returns<Pick<UserProfile, "id" | "full_name">[]>(),
      supabase
        .from("equipment")
        .select("id, name")
        .eq("active", true)
        .order("name")
        .returns<Pick<Equipment, "id" | "name">[]>(),
    ]);

  if (!defect) notFound();

  const nameById = new Map(
    (users ?? []).map((u) => [u.id, u.full_name ?? "Unknown"] as const),
  );

  // Gallery: prefer image_paths, fall back to legacy single image_path so old
  // rows still render their hero.
  const photoPaths =
    defect.image_paths && defect.image_paths.length > 0
      ? defect.image_paths
      : defect.image_path
        ? [defect.image_path]
        : [];
  const signedPhotos: { path: string; url: string }[] = [];
  for (const p of photoPaths) {
    const { data } = await supabase.storage
      .from("equipment-photos")
      .createSignedUrl(p, 300);
    if (data?.signedUrl) signedPhotos.push({ path: p, url: data.signedUrl });
  }
  const hero = signedPhotos[0] ?? null;
  const thumbs = signedPhotos.slice(1);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">{defect.title}</h1>
        <Link href="/defects" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium uppercase tracking-wide text-slate-600">
          {DEFECT_STATUS_LABELS[defect.status]}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium uppercase tracking-wide text-slate-600">
          Severity: {DEFECT_SEVERITY_LABELS[defect.severity]}
        </span>
        <span className="text-slate-400">
          Reported {formatDate(defect.created_at.slice(0, 10))}
          {defect.reported_by && (
            <span> · by {nameById.get(defect.reported_by) ?? "Unknown"}</span>
          )}
        </span>
      </div>

      {hero && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.url}
            alt={defect.title}
            className="w-full max-h-72 rounded-2xl object-cover ring-1 ring-slate-200"
          />
          {thumbs.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {thumbs.map((t) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={t.path}
                  src={t.url}
                  alt=""
                  className="aspect-square w-full rounded-lg object-cover ring-1 ring-slate-200"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {defect.description && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <p className="whitespace-pre-wrap text-sm text-slate-700">
            {defect.description}
          </p>
        </div>
      )}

      <DefectStatusControls
        defect={defect}
        users={users ?? []}
        equipment={equipment ?? []}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Discussion</h2>
        <CommentsThread
          postUrl={`/api/defects/${defect.id}/comments`}
          initial={comments ?? []}
          nameById={nameById}
        />
      </section>
    </div>
  );
}
