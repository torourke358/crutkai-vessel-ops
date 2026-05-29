import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16 renamed `middleware` to `proxy`. Runs on the nodejs runtime and
// refreshes the Supabase session cookie before each matched request.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip /api/* — those routes enforce their own auth and return 401 JSON.
  // Letting the proxy redirect them to /login turns 401s into 200 HTML, which
  // breaks client error handling (fetch follows the redirect, res.ok=true).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)",
  ],
};
