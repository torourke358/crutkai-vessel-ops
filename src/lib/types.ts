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
  related_component_id: string | null;
  critical_threshold: number | null;
  notes: string | null;
  alert_state: "above" | "at_or_below";
  created_at: string;
  updated_at: string;
}
