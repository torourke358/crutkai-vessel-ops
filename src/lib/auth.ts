import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

// Server-side role lookup. Returns 'admin' or 'crew' for the current user,
// defaulting to 'crew' if there's no session or profile.
export async function getUserRole(): Promise<Role> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "crew";

  const { data } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return data?.role === "admin" ? "admin" : "crew";
}
