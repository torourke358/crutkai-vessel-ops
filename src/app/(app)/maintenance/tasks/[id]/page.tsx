import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HIDDEN_CREW_ID } from "@/lib/crew";
import { getUserRole } from "@/lib/auth";
import { formatAmount, formatDate, todayLocal } from "@/lib/format";
import { computeDueState } from "@/lib/maintenance";
import MaintenanceTaskEditor from "@/components/MaintenanceTaskEditor";
import CompleteTaskDialog from "@/components/CompleteTaskDialog";
import type {
  Equipment,
  MaintenanceTask,
  MaintenanceHistoryEntry,
} from "@/lib/types";
import type { PartsAvailable } from "@/components/PartsConsumedPicker";

export const dynamic = "force-dynamic";

export default async function MaintenanceTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const role = await getUserRole();

  const { data: task } = await supabase
    .from("maintenance_tasks")
    .select()
    .eq("id", id)
    .single<MaintenanceTask>();
  if (!task) notFound();

  const [{ data: equipment }, { data: allEquipment }, { data: users }, { data: history }, { data: inventory }] =
    await Promise.all([
      supabase.from("equipment").select().eq("id", task.equipment_id).single<Equipment>(),
      supabase.from("equipment").select("id, name").eq("active", true).order("name"),
      supabase.from("user_profiles").select("id, full_name").eq("active", true).neq("id", HIDDEN_CREW_ID).order("full_name"),
      supabase
        .from("maintenance_history")
        .select("id, task_id, equipment_id, completed_at, completed_by, hours_at_completion, comments")
        .eq("task_id", id)
        .order("completed_at", { ascending: false })
        .returns<MaintenanceHistoryEntry[]>(),
      supabase
        .from("inventory_items")
        .select("id, part_name, part_number, quantity, unit")
        .order("part_name")
        .returns<PartsAvailable[]>(),
    ]);

  const due = computeDueState(
    {
      due_type: task.due_type,
      interval_days: task.interval_days,
      interval_hours: task.interval_hours,
      last_done_date: task.last_done_date,
      hours_at_last_done: task.hours_at_last_done,
    },
    equipment?.current_hours ?? null,
    todayLocal(),
  );

  // Resolve user names on history rows
  const userIds = [...new Set((history ?? []).map((h) => h.completed_by).filter(Boolean) as string[])];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const));

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">{task.title}</h1>
        <Link href="/maintenance/tasks" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Status" value={due.state} accent={due.state} />
        <Stat
          label={task.due_type === "calendar" ? "Next due" : "Next due at"}
          value={
            task.due_type === "calendar"
              ? due.dueAt ? formatDate(due.dueAt as string) : "—"
              : due.dueAt != null ? `${due.dueAt} hrs` : "—"
          }
        />
      </div>

      <section className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
        <p className="text-sm text-slate-700">
          <span className="font-medium">Equipment:</span> {equipment?.name ?? "Unknown"}
        </p>
        <p className="text-sm text-slate-700">
          <span className="font-medium">Due type:</span>{" "}
          {task.due_type === "calendar"
            ? `Every ${task.interval_days} day(s)`
            : `Every ${task.interval_hours} hrs`}
        </p>
        {task.last_done_date && (
          <p className="text-sm text-slate-700">
            <span className="font-medium">Last done date:</span> {formatDate(task.last_done_date)}
          </p>
        )}
        {task.hours_at_last_done != null && (
          <p className="text-sm text-slate-700">
            <span className="font-medium">Hours at last done:</span> {task.hours_at_last_done}
          </p>
        )}
        {task.priority && (
          <p className="text-sm text-slate-700">
            <span className="font-medium">Priority:</span> {task.priority}
          </p>
        )}
        {task.cost != null && (
          <p className="text-sm text-slate-700">
            <span className="font-medium">Cost:</span> {formatAmount(task.cost, "USD")}
          </p>
        )}
        {task.description && (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            <span className="font-medium">Description:</span> {task.description}
          </p>
        )}
      </section>

      <CompleteTaskDialog
        taskId={task.id}
        dueType={task.due_type}
        currentHours={equipment?.current_hours ?? null}
        availableParts={inventory ?? []}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">History</h2>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          {(history ?? []).length === 0 ? (
            <li className="p-4 text-center text-sm text-slate-400">
              No sign-offs yet.
            </li>
          ) : (
            (history ?? []).map((h) => (
              <li key={h.id} className="p-3">
                <p className="text-sm font-medium text-slate-700">
                  {formatDate(h.completed_at.slice(0, 10))}
                  {h.hours_at_completion != null && (
                    <span className="text-slate-500"> @ {h.hours_at_completion} hrs</span>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  by {(h.completed_by && nameById.get(h.completed_by)) || "Unknown"}
                </p>
                {h.comments && (
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{h.comments}</p>
                )}
              </li>
            ))
          )}
        </ul>
      </section>

      {role === "admin" && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">Edit task</h2>
          <MaintenanceTaskEditor
            initial={task}
            equipment={allEquipment ?? []}
            users={users ?? []}
          />
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "ok" | "due" | "overdue";
}) {
  const accents: Record<string, string> = {
    ok: "text-emerald-700",
    due: "text-amber-700",
    overdue: "text-rose-700",
  };
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          accent ? accents[accent] : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
