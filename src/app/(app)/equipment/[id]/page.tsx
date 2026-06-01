import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import EquipmentEditor from "@/components/EquipmentEditor";
import EquipmentDocuments from "@/components/EquipmentDocuments";
import HourReadingForm from "@/components/HourReadingForm";
import { formatDate, todayLocal } from "@/lib/format";
import { computeDueState } from "@/lib/maintenance";
import type {
  Component,
  Equipment,
  EquipmentDocument,
  EquipmentHourReading,
  MaintenanceTask,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const role = await getUserRole();
  // eslint-disable-next-line react-hooks/purity -- server component, evaluated per request
  const nowMs = Date.now();

  const [
    { data: equipment },
    { data: components },
    { data: readings },
    { data: tasks },
    { data: documents },
  ] = await Promise.all([
    supabase.from("equipment").select().eq("id", id).single<Equipment>(),
    supabase
      .from("components")
      .select("id, code, name, display_order, active")
      .eq("active", true)
      .order("display_order")
      .returns<Component[]>(),
    supabase
      .from("equipment_hour_readings")
      .select("id, equipment_id, hours, recorded_by, recorded_at, source")
      .eq("equipment_id", id)
      .order("recorded_at", { ascending: false })
      .limit(20)
      .returns<EquipmentHourReading[]>(),
    supabase
      .from("maintenance_tasks")
      .select()
      .eq("equipment_id", id)
      .order("active", { ascending: false })
      .order("title", { ascending: true })
      .returns<MaintenanceTask[]>(),
    supabase
      .from("equipment_documents")
      .select()
      .eq("equipment_id", id)
      .order("uploaded_at", { ascending: false })
      .returns<EquipmentDocument[]>(),
  ]);

  if (!equipment) notFound();

  const today = todayLocal();

  // Build the photo strip: first photo is the hero, the rest render as
  // thumbnails. Falls back to the legacy single image_path for rows that
  // haven't been migrated to image_paths yet.
  const photoPaths =
    equipment.image_paths && equipment.image_paths.length > 0
      ? equipment.image_paths
      : equipment.image_path
        ? [equipment.image_path]
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

  // Resolve recorded_by names for the readings panel.
  const userIds = [...new Set((readings ?? []).map((r) => r.recorded_by).filter(Boolean) as string[])];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name] as const),
  );

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-slate-900">
            {equipment.name}
          </h1>
          <div className="mt-1 flex flex-wrap gap-1">
            {equipment.critical && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-700">
                Critical
              </span>
            )}
            {equipment.is_ism && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-700">
                ISM
              </span>
            )}
            {equipment.is_isps && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-700">
                ISPS
              </span>
            )}
          </div>
        </div>
        <Link href="/equipment" className="shrink-0 text-sm text-slate-500">
          Back
        </Link>
      </div>

      {hero && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.url}
            alt={equipment.name}
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

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Current hours
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {equipment.current_hours ?? "—"}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Latest reading
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {readings?.[0]
              ? `${readings[0].hours} hrs`
              : "—"}
          </p>
          {readings?.[0] && (
            <p className="text-xs text-slate-400">
              {formatDate(readings[0].recorded_at.slice(0, 10))}
              {readings[0].recorded_by && (
                <span> · {nameById.get(readings[0].recorded_by) ?? "Unknown"}</span>
              )}
            </p>
          )}
        </div>
        <div className="col-span-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Commissioned
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {equipment.commissioned_date
              ? formatDate(equipment.commissioned_date)
              : "—"}
          </p>
          {equipment.commissioned_date && (
            <p className="text-xs text-slate-400">
              {(() => {
                const [y, m, d] = equipment.commissioned_date.split("-").map(Number);
                const since = new Date(y, m - 1, d, 12).getTime();
                const years = (nowMs - since) / (1000 * 60 * 60 * 24 * 365.25);
                return `~${years.toFixed(1)} years in service`;
              })()}
            </p>
          )}
        </div>
      </div>

      {/* Record hours (any signed-in user) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Record hours</h2>
        <HourReadingForm
          equipmentId={equipment.id}
          currentHours={equipment.current_hours}
        />
      </section>

      {/* Hour reading history */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">
          Recent readings
        </h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {(readings ?? []).length === 0 ? (
            <li className="p-4 text-center text-sm text-slate-400">
              No readings yet.
            </li>
          ) : (
            (readings ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {r.hours} hrs
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDate(r.recorded_at.slice(0, 10))}
                    {r.recorded_by && (
                      <span> · {nameById.get(r.recorded_by) ?? "Unknown"}</span>
                    )}
                    {r.source === "maintenance_completion" && (
                      <span className="ml-1 text-slate-400">· via task sign-off</span>
                    )}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Maintenance tasks for this unit */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Maintenance tasks
          </h2>
          {role === "admin" && (
            <Link
              href={`/maintenance/tasks/new?equipment=${equipment.id}`}
              className="text-sm font-medium text-violet-700 hover:underline"
            >
              + New PM
            </Link>
          )}
        </div>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {(tasks ?? []).length === 0 ? (
            <li className="p-4 text-center text-sm text-slate-400">
              No maintenance tasks yet.
            </li>
          ) : (
            (tasks ?? []).map((t) => {
              const due = t.active
                ? computeDueState(t, equipment.current_hours, today)
                : null;
              const interval =
                t.due_type === "calendar"
                  ? t.interval_days
                    ? `every ${t.interval_days} d`
                    : "no interval"
                  : t.interval_hours
                    ? `every ${t.interval_hours} hrs`
                    : "no interval";
              const stateBadge =
                due == null
                  ? { label: "Inactive", cls: "bg-slate-100 text-slate-500" }
                  : due.state === "overdue"
                    ? { label: "Overdue", cls: "bg-rose-100 text-rose-700" }
                    : due.state === "due"
                      ? { label: "Due", cls: "bg-amber-100 text-amber-700" }
                      : { label: "OK", cls: "bg-emerald-50 text-emerald-700" };
              return (
                <li key={t.id}>
                  <Link
                    href={`/maintenance/tasks/${t.id}`}
                    className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {t.title}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {t.due_type === "calendar" ? "Calendar" : "Hours"} ·{" "}
                        {interval}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${stateBadge.cls}`}
                    >
                      {stateBadge.label}
                    </span>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
        <p className="text-xs text-slate-400">
          Tap a task to change its due type (hours ↔ calendar), interval, or
          last-done date.
        </p>
      </section>

      {/* Documents */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
        <EquipmentDocuments
          equipmentId={equipment.id}
          initial={documents ?? []}
          isAdmin={role === "admin"}
        />
      </section>

      {/* Admin edit panel */}
      {role === "admin" ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Edit details
          </h2>
          <EquipmentEditor initial={equipment} components={components ?? []} />
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">Details</h2>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100 text-sm">
            <dt className="text-slate-500">Make</dt>
            <dd className="text-slate-900">{equipment.make ?? "—"}</dd>
            <dt className="text-slate-500">Model</dt>
            <dd className="text-slate-900">{equipment.model ?? "—"}</dd>
            <dt className="text-slate-500">Serial</dt>
            <dd className="text-slate-900">{equipment.serial ?? "—"}</dd>
            <dt className="text-slate-500">Location</dt>
            <dd className="text-slate-900">{equipment.location_on_vessel ?? "—"}</dd>
            {equipment.notes && (
              <>
                <dt className="text-slate-500 col-span-2 mt-2">Notes</dt>
                <dd className="col-span-2 text-slate-900">{equipment.notes}</dd>
              </>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
