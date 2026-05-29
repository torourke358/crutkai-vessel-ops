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

// GET /api/cron/maintenance-check
// Daily scheduled job. Walks every active maintenance task, computes its
// due state vs today (vessel-local), and enqueues notifications for the
// users who opted in. Idempotent within a day via last_*_alerted_on.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = todayLocal();
  const supabase = createServiceClient();

  // 1) Pull active tasks + their equipment
  const { data: tasks, error: taskErr } = await supabase
    .from("maintenance_tasks")
    .select(
      "id, title, due_type, interval_days, interval_hours, last_done_date, hours_at_last_done, last_due_alerted_on, last_overdue_alerted_on, equipment:equipment(id, name, current_hours)",
    )
    .eq("active", true)
    .returns<TaskRow[]>();

  if (taskErr) {
    console.error("cron maintenance-check: task fetch failed", taskErr);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  // 2) Pull recipients + their settings
  const { data: users } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .eq("active", true);
  const userIds = (users ?? []).map((u) => u.id);

  // For email we need the auth.users.email column — service-role can read it
  // via the auth schema.
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

  // 3) For each task, decide if we need to alert
  const queued: { task_id: string; kind: "maintenance_due" | "maintenance_overdue" }[] = [];

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

    if (due.state === "ok") continue;

    const kind: "maintenance_due" | "maintenance_overdue" =
      due.state === "overdue" ? "maintenance_overdue" : "maintenance_due";
    const lastCol = due.state === "overdue" ? t.last_overdue_alerted_on : t.last_due_alerted_on;

    if (lastCol === today) continue; // already alerted today

    const subject = `${kind === "maintenance_overdue" ? "Overdue" : "Due"}: ${t.title}`;
    const equipmentName = t.equipment?.name ?? "Unknown equipment";
    const body =
      t.due_type === "calendar"
        ? `${t.title} on ${equipmentName} ${kind === "maintenance_overdue" ? "was due" : "is due"} ${due.dueAt ?? "—"}.`
        : `${t.title} on ${equipmentName} ${kind === "maintenance_overdue" ? "was due at" : "is due at"} ${due.dueAt ?? "—"} hrs (current ${t.equipment?.current_hours ?? "—"}).`;

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

    // Mark idempotency column
    await supabase
      .from("maintenance_tasks")
      .update(
        kind === "maintenance_overdue"
          ? { last_overdue_alerted_on: today }
          : { last_due_alerted_on: today },
      )
      .eq("id", t.id);

    queued.push({ task_id: t.id, kind });
  }

  return NextResponse.json({ checked: tasks?.length ?? 0, queued: queued.length });
}
