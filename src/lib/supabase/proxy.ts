import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cleanEnv } from "@/lib/supabase/env";

// Refreshes the Supabase auth session on every request and keeps the cookies
// in sync. In Next 16 the old `middleware` convention is renamed to `proxy`
// (nodejs runtime). This helper is invoked from `src/proxy.ts`.
//
// IMPORTANT: do not run logic between createServerClient and getUser() — it
// can cause hard-to-debug session bugs (per the @supabase/ssr guidance).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === "/login";
  const isPublicAsset =
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icon-") ||
    pathname === "/favicon.ico";

  // Redirect helper that forwards any refreshed-session cookies from
  // supabaseResponse onto the redirect response — otherwise rotated tokens are
  // silently dropped and the browser keeps replaying the expired ones.
  function redirectTo(targetPath: string) {
    const url = request.nextUrl.clone();
    url.pathname = targetPath;
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  }

  // Not logged in and not on the login page → send to login.
  if (!user && !isAuthRoute && !isPublicAsset) return redirectTo("/login");

  // Logged in but sitting on the login page → send to the app.
  if (user && isAuthRoute) return redirectTo("/");

  return supabaseResponse;
}
