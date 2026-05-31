import { createClient } from "@/lib/supabase/server";
import EquipmentHoursLog, {
  type LogRow,
} from "@/components/EquipmentHoursLog";

export const dynamic = "force-dynamic";

interface MaintRow {
  id: string;
  equipment_id: string;
  due_type: "calendar" | "hours";
  interval_hours: number | null;
  hours_at_last_done: number | null;
}

interface EquipmentRow {
  id: string;
  name: string;
  location_on_vessel: string | null;
  current_hours: number | null;
}

export default async function EquipmentLogPage() {
  const supabase = await createClient();

  // Fetch active equipment + their hours-based maintenance tasks so the
  // log page can show "next PM at X hrs" next to each equipment row.
  const [{ data: equipment }, { data: tasks }] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, name, location_on_vessel, current_hours")
      .eq("active", true)
      .order("name")
      .returns<EquipmentRow[]>(),
    supabase
      .from("maintenance_tasks")
      .select("id, equipment_id, due_type, interval_hours, hours_at_last_done")
      .eq("active", true)
      .eq("due_type", "hours")
      .returns<MaintRow[]>(),
  ]);

  // For each equipment, compute the next hours-based PM threshold across
  // all its tasks (use the SOONEST one — that's what they're racing toward).
  const nextPmByEquipment = new Map<string, number>();
  for (const t of tasks ?? []) {
    if (t.interval_hours == null) continue;
    const next = (t.hours_at_last_done ?? 0) + t.interval_hours;
    const current = nextPmByEquipment.get(t.equipment_id);
    if (current == null || next < current) {
      nextPmByEquipment.set(t.equipment_id, next);
    }
  }

  const rows: LogRow[] = (equipment ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    location_on_vessel: e.location_on_vessel,
    current_hours: e.current_hours,
    next_pm_hours: nextPmByEquipment.get(e.id) ?? null,
  }));

  return <EquipmentHoursLog rows={rows} />;
}
