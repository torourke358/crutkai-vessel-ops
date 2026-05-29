import { createBrowserClient } from "@supabase/ssr";
import { cleanEnv } from "@/lib/supabase/env";

// Browser-side Supabase client. Safe to call from client components.
// Uses the anon key and respects RLS via the user's session cookie.
export function createClient() {
  return createBrowserClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
