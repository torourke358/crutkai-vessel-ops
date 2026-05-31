// Domain types mirroring the Supabase schema. Module-specific types live next
// to their feature folders; the shared role/user types live here.

export type Role = "crew" | "admin";

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: Role;
  active: boolean;
}

// Lookup of high-level categories (Seahub's "System" + part-type groupings).
export interface Component {
  id: string;
  code: string;
  name: string;
  display_order: number;
  active: boolean;
}

export interface InventoryItem {
  id: string;
  part_name: string;
  part_number: string | null;
  make: string | null;
  quantity: number;
  unit: string;
  location: string | null;
  component_ids: string[];           // up to 8 component refs (replaces related_component_id)
  location_photo_path: string | null; // storage path under inventory-photos bucket
  critical_threshold: number | null;
  notes: string | null;
  alert_state: "above" | "at_or_below";
  created_at: string;
  updated_at: string;
}

export const MAX_INVENTORY_COMPONENTS = 8;

export interface Equipment {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  serial: string | null;
  location_on_vessel: string | null;
  current_hours: number | null;
  component_id: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EquipmentHourReading {
  id: string;
  equipment_id: string;
  hours: number;
  recorded_by: string | null;
  recorded_at: string;
  source: "manual" | "maintenance_completion";
}

export type DueType = "calendar" | "hours";
export type MaintenancePriority = "low" | "moderate" | "high" | "critical";

export interface MaintenanceTask {
  id: string;
  equipment_id: string;
  title: string;
  description: string | null;
  priority: MaintenancePriority | null;
  due_type: DueType;
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  hours_at_last_done: number | null;
  assigned_to: string | null;
  active: boolean;
  last_due_alerted_on: string | null;
  last_overdue_alerted_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceHistoryEntry {
  id: string;
  task_id: string;
  equipment_id: string;
  completed_at: string;
  completed_by: string | null;
  hours_at_completion: number | null;
  comments: string | null;
}

export type YardStatus = "planned" | "active" | "closed";
export type YardTaskStatus = "todo" | "in_progress" | "done";
export type YardTaskEffort = "S" | "M" | "L";

export interface YardPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  status: YardStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface YardQuadrant {
  id: string;
  yard_period_id: string;
  name: string;
  color: string;
  display_order: number;
  created_at: string;
}

export interface YardTask {
  id: string;
  yard_period_id: string;
  quadrant_id: string;
  title: string;
  description: string | null; // used as the "Notes" field in the UI
  owner_id: string | null;
  progress_pct: number;
  effort: YardTaskEffort | null;
  due_date: string | null;
  reminder_date: string | null;
  resources: string | null;
  status: YardTaskStatus;
  actual_cost: number | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationKind =
  | "inventory_critical"
  | "maintenance_due"
  | "maintenance_overdue";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  channel: "in_app" | "email";
  recipient_id: string;
  recipient_email: string | null;
  subject: string;
  body: string;
  related_type: string | null;
  related_id: string | null;
  status: "pending" | "sent" | "failed";
  error: string | null;
  read_at: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface NotificationSettings {
  user_id: string;
  inventory_in_app: boolean;
  inventory_email: boolean;
  maintenance_in_app: boolean;
  maintenance_email: boolean;
  updated_at: string;
}
