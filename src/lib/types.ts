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

// Physical locations on the vessel ("part of the ship"). The managed list that
// feeds the equipment "Location on vessel" dropdown; equipment stores the
// chosen name string in equipment.location_on_vessel.
export interface VesselZone {
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
  unit_price: number | null;         // USD per unit, for reorder math
  supplier: string | null;
  lead_time_days: number | null;
  notes: string | null;
  alert_state: "above" | "at_or_below";
  created_at: string;
  updated_at: string;
}

export type InventoryDocumentKind = "quotation" | "invoice" | "spec" | "image" | "other";
export const INVENTORY_DOCUMENT_KIND_LABELS: Record<InventoryDocumentKind, string> = {
  quotation: "Quotation",
  invoice: "Invoice",
  spec: "Spec / data sheet",
  image: "Image",
  other: "Other",
};

export interface InventoryDocument {
  id: string;
  inventory_item_id: string;
  kind: InventoryDocumentKind;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export const MAX_INVENTORY_COMPONENTS = 8;

// What a piece of equipment IS, which decides where it's listed.
//   vessel    — the boat's own machinery: engines, gensets, gearboxes
//   guest_toy — kit guests use: scuba cylinders, regulators, scooters, seabobs
//   galley    — F&B kit: wine fridge, ice maker, coffee machine
export type EquipmentKind = "vessel" | "guest_toy" | "galley";

export const EQUIPMENT_KIND_LABELS: Record<EquipmentKind, string> = {
  vessel: "Vessel machinery",
  guest_toy: "Guest toy",
  galley: "Galley / F&B",
};

export interface Equipment {
  id: string;
  name: string;
  kind: EquipmentKind;
  // Set when a piece of kit was bought as part of a refit — a new wine fridge
  // on a yard invoice. Left null for anything bought in the ordinary run of
  // the year, which is petty cash's business, not the yard's.
  acquired_yard_period_id: string | null;
  acquired_invoice_id: string | null;
  make: string | null;
  model: string | null;
  serial: string | null;
  location_on_vessel: string | null;
  current_hours: number | null;
  component_id: string | null;
  commissioned_date: string | null; // when the unit physically went into service
  image_path: string | null;        // legacy single hero photo (kept until app code drops it)
  image_paths: string[];            // gallery of photo paths under equipment-photos
  critical: boolean;
  cost: number | null;              // purchase / replacement cost in USD
  ga_x: number | null;              // pin position on /public/ga-schematic.svg (0..100 % of width)
  ga_y: number | null;              // pin position (0..100 % of height)
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type EquipmentDocumentKind =
  | "manual"
  | "spec"
  | "drawing"
  | "service_report"
  | "other";

export interface EquipmentDocument {
  id: string;
  equipment_id: string;
  kind: EquipmentDocumentKind;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export const EQUIPMENT_DOCUMENT_KIND_LABELS: Record<EquipmentDocumentKind, string> = {
  manual: "OEM manual",
  spec: "Spec / data sheet",
  drawing: "Drawing",
  service_report: "Service report",
  other: "Other",
};

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
  cost: number | null;              // estimated cost of the task in USD
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

export type YardTaskUrgency = "fires" | "prioritize" | "reduce" | "repository";
export const YARD_TASK_URGENCY_LABELS: Record<YardTaskUrgency, string> = {
  fires: "Fires (urgent + important)",
  prioritize: "Prioritize (important, not urgent)",
  reduce: "Reduce (urgent, not important)",
  repository: "Repository (neither)",
};

export interface YardTask {
  id: string;
  yard_period_id: string;
  quadrant_id: string;
  title: string;
  description: string | null; // used as the "Notes" field in the UI
  owner_id: string | null;
  follower_ids: string[];     // additional users notified on changes
  progress_pct: number;
  effort: YardTaskEffort | null;
  urgency: YardTaskUrgency | null;
  due_date: string | null;
  reminder_date: string | null;
  resources: string | null;
  status: YardTaskStatus;
  actual_cost: number | null;
  // Schedule (17_yard_money_and_schedule). due_date above is untouched — the
  // board, reports and reminder cron all still read it.
  start_date: string | null;
  end_date: string | null;
  zone_id: string | null;
  trade: string | null;
  estimate_id: string | null;
  depends_on_ids: string[];
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface YardTaskComment {
  id: string;
  yard_task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface YardTaskDocument {
  id: string;
  yard_task_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

// Dry-dock disassembly planner: photos of an area → AI-ordered plan → tasks.
export type DisassemblyPlanStatus = "draft" | "final" | "converted";

export interface DisassemblyPlan {
  id: string;
  created_by: string | null;
  yard_period_id: string | null;
  area_name: string;
  status: DisassemblyPlanStatus;
  photo_paths: string[];        // storage paths under disassembly-photos bucket
  summary: string | null;
  model: string | null;         // AI model that produced the plan
  created_at: string;
  updated_at: string;
}

export interface DisassemblyStep {
  id: string;
  plan_id: string;
  seq: number;                  // 1-based disassembly order
  title: string;
  description: string | null;
  equipment_label: string | null;         // e.g. "Port main engine"
  depends_on_seqs: number[];              // seq values that must finish first
  is_blocking: boolean;                   // must be scheduled before work starts
  external_contractor: string | null;     // e.g. "AC / refrigeration"
  contractor_lead_time_days: number | null;
  est_hours: number | null;
  flag_reason: string | null;             // why this step is flagged
}

export type DefectStatus = "open" | "in_progress" | "resolved";
export type DefectSeverity = "low" | "normal" | "high" | "critical";

export const DEFECT_STATUS_LABELS: Record<DefectStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};
export const DEFECT_SEVERITY_LABELS: Record<DefectSeverity, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

export interface Defect {
  id: string;
  title: string;
  description: string | null;
  equipment_id: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  status: DefectStatus;
  severity: DefectSeverity;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
  image_path: string | null;  // legacy single hero photo, replaced by image_paths
  image_paths: string[];      // gallery of photos under equipment-photos bucket
  created_at: string;
  updated_at: string;
}

export interface DefectComment {
  id: string;
  defect_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface ChecklistTemplate {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  display_order: number;
  body: string;
  required: boolean;
}

export interface ChecklistRun {
  id: string;
  template_id: string;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
}

export interface ChecklistRunItem {
  id: string;
  run_id: string;
  template_item_id: string;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  note: string | null;
}

export type VesselLogCategory = "crossing" | "charter" | "guest" | "crew" | "other";
export const VESSEL_LOG_CATEGORY_LABELS: Record<VesselLogCategory, string> = {
  crossing: "Crossing",
  charter: "Charter",
  guest: "Guest arrival",
  crew: "Crew",
  other: "Other",
};

export interface VesselLog {
  id: string;
  log_date: string;
  category: VesselLogCategory;
  title: string;
  body: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationKind =
  | "inventory_critical"
  | "maintenance_due_soon"
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

// ---------------------------------------------------------------------------
// Yard money (17_yard_money_and_schedule).
//
// Three tables, not one: an estimate is the COMMITMENT, an invoice is the
// BILL, a payment is CASH. A deposit is a payment with no invoice behind it.
// Merging them would double-count a deposit against the invoice it covers.
//
// An estimate is also the timeline's phase bar — same row, both jobs.
// ---------------------------------------------------------------------------

export const YARD_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type YardCurrency = (typeof YARD_CURRENCIES)[number];

export type AiConfidence = "high" | "medium" | "low";

export interface YardVendor {
  id: string;
  name: string;
  trade: string | null;
  contact: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type YardEstimateStatus =
  | "draft"
  | "approved"
  | "in_progress"
  | "closed"
  | "declined";

export const YARD_ESTIMATE_STATUS_LABELS: Record<YardEstimateStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  in_progress: "In progress",
  closed: "Closed",
  declined: "Declined",
};

export interface YardEstimate {
  id: string;
  yard_period_id: string;
  vendor_id: string | null;
  title: string;
  reference: string | null;
  amount: number | null;
  currency: YardCurrency;
  start_date: string | null;
  end_date: string | null;
  status: YardEstimateStatus;
  document_path: string | null;
  ai_extraction: unknown;
  ai_confidence: AiConfidence | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface YardInvoice {
  id: string;
  yard_period_id: string;
  estimate_id: string | null;
  reference: string | null;
  amount: number;
  issued_date: string | null;
  document_path: string | null;
  ai_extraction: unknown;
  ai_confidence: AiConfidence | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type YardPaymentKind = "deposit" | "progress" | "final" | "refund";

export const YARD_PAYMENT_KIND_LABELS: Record<YardPaymentKind, string> = {
  deposit: "Deposit",
  progress: "Payment",
  final: "Final payment",
  refund: "Refund",
};

export interface YardPayment {
  id: string;
  yard_period_id: string;
  estimate_id: string | null;
  invoice_id: string | null;
  kind: YardPaymentKind;
  amount: number;
  paid_date: string | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Clash rules. Checked in the browser on every drag — instant, free, and the
// same answer every time. Claude is a second pass that proposes new rows.
export type ConflictRuleKind = "same_zone" | "trade_pair";
export type ConflictSeverity = "warn" | "block";

export interface YardConflictRule {
  id: string;
  kind: ConflictRuleKind;
  trade_a: string | null;
  trade_b: string | null;
  zone_id: string | null;
  severity: ConflictSeverity;
  reason: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

// The trades the clash rules know about. Free text in the column so Craig
// isn't boxed in, but these are what the pickers offer.
export const YARD_TRADES = [
  "machinery",
  "sanding",
  "spraying",
  "varnish",
  "fabrication",
  "fitting",
  "electrical",
  "refrigeration",
  "canvas",
  "hot work",
  "cleaning",
] as const;
