import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/resend";
import { todayLocal } from "@/lib/format";
import { computeDueState } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

interface TaskRow {
  id: string;
  title: string;
  due_type: "calendar" | "hours";
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  hours_at_last_done: number | null;
  last_due_soon_alerted_on: string | null;
  last_due_alerted_on: string | null;
  last_overdue_alerted_on: string | null;
  equipment: {
    id: string;
    name: string;
    current_hours: number | null;
  } | null;
}

interface SettingsRow {
  user_id: string;
  maintenance_in_app: boolean;
  maintenance_email: boolean;
}

type AlertKind = "maintenance_due_soon" | "maintenance_due" | "maintenance_overdue";

// "Due soon" window: current_hours has crossed into the last 10% of the
// interval before the next PM. Returns true when:
//   nextDue - (interval * 0.10) <= current < nextDue
function isDueSoon(
  due_type: "calendar" | "hours",
  interval_hours: number | null,
  hoursAtLastDone: number | null,
  currentHours: number | null,
): boolean {
  if (due_type !== "hours") return false;
  if (!interval_hours || currentHours == null) return false;
  const next = (hoursAtLastDone ?? 0) + interval_hours;
  const window = next - interval_hours * 0.10;
  return currentHours >= window && currentHours < next;
}

// GET /api/cron/maintenance-check
// Daily scheduled job. Walks every active maintenance task and enqueues:
//   - "due_soon" 10% before an hours-based PM
//   - "due" when on or past the due date / hours
//   - "overdue" when past
// Idempotent within a day via last_*_alerted_on columns.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = todayLocal();
  const supabase = createServiceClient();

  const { data: tasks, error: taskErr } = await supabase
    .from("maintenance_tasks")
    .select(
      "id, title, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, last_due_soon_alerted_on, last_due_alerted_on, last_overdue_alerted_on, equipment:equipment(id, name, current_hours)",
    )
    .eq("active", true)
    .returns<TaskRow[]>();

  if (taskErr) {
    console.error("cron maintenance-check: task fetch failed", taskErr);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const { data: users } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .eq("active", true);
  const userIds = (users ?? []).map((u) => u.id);

  const { data: emails } = await supabase
    .schema("auth")
    .from("users")
    .select("id, email")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const emailById = new Map((emails ?? []).map((e) => [e.id, e.email as string | null]));

  const { data: settings } = await supabase
    .from("notification_settings")
    .select("user_id, maintenance_in_app, maintenance_email")
    .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"])
    .returns<SettingsRow[]>();
  const settingsById = new Map((settings ?? []).map((s) => [s.user_id, s]));

  async function enqueueFor(
    t: TaskRow,
    kind: AlertKind,
    subject: string,
    body: string,
  ) {
    for (const u of users ?? []) {
      const s = settingsById.get(u.id);
      const wantsInApp = s?.maintenance_in_app ?? false;
      const wantsEmail = s?.maintenance_email ?? false;
      const email = emailById.get(u.id) ?? null;

      if (wantsInApp) {
        await supabase.from("notifications").insert({
          kind,
          channel: "in_app",
          recipient_id: u.id,
          recipient_email: email,
          subject,
          body,
          related_type: "maintenance_task",
          related_id: t.id,
        });
      }
      if (wantsEmail && email) {
        await supabase.from("notifications").insert({
          kind,
          channel: "email",
          recipient_id: u.id,
          recipient_email: email,
          subject,
          body,
          related_type: "maintenance_task",
          related_id: t.id,
        });
      }
    }
  }

  const queued: { task_id: string; kind: AlertKind }[] = [];

  for (const t of tasks ?? []) {
    const due = computeDueState(
      {
        due_type: t.due_type,
        interval_days: t.interval_days,
        interval_hours: t.interval_hours,
        last_done_date: t.last_done_date,
        hours_at_last_done: t.hours_at_last_done,
      },
      t.equipment?.current_hours ?? null,
      today,
    );

    const equipmentName = t.equipment?.name ?? "Unknown equipment";

    if (due.state === "overdue") {
      if (t.last_overdue_alerted_on === today) continue;
      const subject = `Overdue: ${t.title}`;
      const body =
        t.due_type === "calendar"
          ? `${t.title} on ${equipmentName} was due ${due.dueAt ?? "—"}.`
          : `${t.title} on ${equipmentName} was due at ${due.dueAt ?? "—"} hrs (current ${t.equipment?.current_hours ?? "—"}).`;
      await enqueueFor(t, "maintenance_overdue", subject, body);
      await supabase
        .from("maintenance_tasks")
        .update({ last_overdue_alerted_on: today })
        .eq("id", t.id);
      queued.push({ task_id: t.id, kind: "maintenance_overdue" });
      continue;
    }

    if (due.state === "due") {
      if (t.last_due_alerted_on === today) continue;
      const subject = `Due: ${t.title}`;
      const body =
        t.due_type === "calendar"
          ? `${t.title} on ${equipmentName} is due ${due.dueAt ?? "—"}.`
          : `${t.title} on ${equipmentName} is due at ${due.dueAt ?? "—"} hrs (current ${t.equipment?.current_hours ?? "—"}).`;
      await enqueueFor(t, "maintenance_due", subject, body);
      await supabase
        .from("maintenance_tasks")
        .update({ last_due_alerted_on: today })
        .eq("id", t.id);
      queued.push({ task_id: t.id, kind: "maintenance_due" });
      continue;
    }

    // state === 'ok' — check the 10% early-warning window for hours tasks
    if (
      isDueSoon(
        t.due_type,
        t.interval_hours,
        t.hours_at_last_done,
        t.equipment?.current_hours ?? null,
      )
    ) {
      if (t.last_due_soon_alerted_on === today) continue;
      const nextDueHours = (t.hours_at_last_done ?? 0) + (t.interval_hours ?? 0);
      const remaining = nextDueHours - (t.equipment?.current_hours ?? 0);
      const subject = `Coming up: ${t.title} (within 10%)`;
      const body = `${t.title} on ${equipmentName} is due at ${nextDueHours} hrs — about ${remaining} hrs away (current ${t.equipment?.current_hours ?? "—"}).`;
      await enqueueFor(t, "maintenance_due_soon", subject, body);
      await supabase
        .from("maintenance_tasks")
        .update({ last_due_soon_alerted_on: today })
        .eq("id", t.id);
      queued.push({ task_id: t.id, kind: "maintenance_due_soon" });
    }
  }

  return NextResponse.json({ checked: tasks?.length ?? 0, queued: queued.length });
}
