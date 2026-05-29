// Domain types mirroring the Supabase schema. Module-specific types live next
// to their feature folders; the shared role/user types live here.

export type Role = "crew" | "admin";

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: Role;
  active: boolean;
}
