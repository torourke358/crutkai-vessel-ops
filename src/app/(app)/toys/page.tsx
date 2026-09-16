import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth";
import { todayLocal, formatDate } from "@/lib/format";
import { computeDueState, isDueSoon } from "@/lib/maintenance";
import type { Equipment, MaintenanceTask } from "@/lib/types";

export const dynamic = "force-dynamic";

// Guest toys — the kit guests use on holiday, and whether it is in test.
//
// This is the equipment register filtered to kind = 'guest_toy'. Nothing here
// is new machinery: a scuba cylinder's annual visual and five-yearly hydro are
// ordinary calendar PM schedules, and the same maintenance cron that watches
// the gensets watches these. What the page adds is the question Craig actually
// asks before guests arrive — is any of it out of test?

type ToyTask = Pick<
  MaintenanceTask,
  | "id"
  | "title"
  | "due_type"
  | "interval_days"
  | "interval_hours"
  | "last_done_date"
  | "hours_at_last_done"
  | "equipment_id"
>;

export default async function ToysPage() {
  const supabase = await createClient();
  const role = await getUserRole();
  const asOf = todayLocal();

  const { data: toys } = await supabase
    .from("equipment")
    .select()
    .eq("kind", "guest_toy")
    .eq("active", true)
    .order("name")
    .returns<Equipment[]>();

  const ids = (toys ?? []).map((t) => t.id);
  const { data: tasks } = ids.length
    ? await supabase
        .from("maintenance_tasks")
        .select(
          "id, title, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, equipment_id",
        )
        .in("equipment_id", ids)
        .eq("active", true)
        .order("title")
        .returns<ToyTask[]>()
    : { data: [] as ToyTask[] };

  const byToy = new Map<string, ToyTask[]>();
  for (const t of tasks ?? []) {
    const arr = byToy.get(t.equipment_id) ?? [];
    arr.push(t);
    byToy.set(t.equipment_id, arr);
  }

  const rows = (toys ?? []).map((toy) => {
    const checks = (byToy.get(toy.id) ?? []).map((t) => {
      const due = computeDueState(t, toy.current_hours, asOf);
      return {
        id: t.id,
        title: t.title,
        state: due.state,
        dueAt: due.dueAt,
        soon: isDueSoon(t, toy.current_hours, asOf),
        scheduled: Boolean(t.interval_days || t.interval_hours),
      };
    });
    const worst = checks.some((c) => c.state === "overdue")
      ? "overdue"
      : checks.some((c) => c.state === "due")
        ? "due"
        : checks.some((c) => c.soon)
          ? "soon"
          : checks.length === 0
            ? "none"
            : "ok";
    return { toy, checks, worst };
  });

  const needsAttention = rows.filter((r) => r.worst === "overdue" || r.worst === "due").length;
  const unscheduled = rows.filter((r) => r.worst === "none").length;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Guest toys</h1>
          <p className="text-sm text-slate-500">
            Scuba, scooters and the rest of the kit guests use &mdash; and whether it is in test.
          </p>
        </div>
        {role === "admin" && (
          <Link
            href="/equipment/new"
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white active:bg-violet-700"
          >
            + Add a toy
          </Link>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-slate-200 sm:grid-cols-3">
          <Tile label="Toys" value={String(rows.length)} />
          <Tile
            label="Need attention"
            value={String(needsAttention)}
            tone={needsAttention > 0 ? "bad" : "ok"}
          />
          <Tile
            label="No service set"
            value={String(unscheduled)}
            tone={unscheduled > 0 ? "warn" : "ok"}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 ring-1 ring-slate-100">
          <p>No guest toys on the register yet.</p>
          <p className="mt-2">
            Add a scuba cylinder, a regulator set or a scooter as equipment and mark it a
            <strong className="text-slate-600"> guest toy</strong>. Give it a service schedule and
            the app will tell you before it goes out of test.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ toy, checks, worst }) => (
            <li key={toy.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/equipment/${toy.id}`}
                    className="font-semibold text-slate-900 hover:text-violet-700"
                  >
                    {toy.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {[toy.make, toy.model, toy.serial ? `s/n ${toy.serial}` : null]
                      .filter(Boolean)
                      .join(" · ") || "No make or model recorded"}
                  </p>
                </div>
                <StatusPill state={worst} />
              </div>

              {checks.length === 0 ? (
                <p className="px-4 py-3 text-xs text-slate-400">
                  No service schedule. A cylinder wants a visual every year and a hydrostatic test
                  every five; a scooter wants its battery serviced.{" "}
                  <Link href={`/equipment/${toy.id}`} className="font-medium text-violet-700">
                    Add one
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {checks.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
                    >
                      <span className="text-slate-700">{c.title}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs tabular-nums text-slate-500">
                          {!c.scheduled
                            ? "No interval set"
                            : c.dueAt == null
                              ? "Never done"
                              : typeof c.dueAt === "string"
                                ? `Due ${formatDate(c.dueAt)}`
                                : `Due at ${c.dueAt} h`}
                        </span>
                        <StatusPill state={c.soon && c.state === "ok" ? "soon" : c.state} small />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "bad" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="bg-white px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-base font-medium tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function StatusPill({ state, small }: { state: string; small?: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    overdue: { label: "Out of test", cls: "bg-rose-100 text-rose-800" },
    due: { label: "Due now", cls: "bg-amber-100 text-amber-800" },
    soon: { label: "Due soon", cls: "bg-amber-50 text-amber-700" },
    ok: { label: "In test", cls: "bg-emerald-100 text-emerald-800" },
    none: { label: "No service set", cls: "bg-slate-100 text-slate-600" },
  };
  const m = map[state] ?? map.none;
  return (
    <span
      className={`rounded-full font-medium ${m.cls} ${
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      {m.label}
    </span>
  );
}
