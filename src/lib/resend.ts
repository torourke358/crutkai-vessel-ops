import { Resend } from "resend";
import { cleanEnv } from "@/lib/supabase/env";

// Singleton client. The library is a thin wrapper around fetch — safe to
// instantiate once per request, but caching saves a few cycles in the
// 1-min outbox cron.
let _resend: Resend | null = null;
export function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(cleanEnv(process.env.RESEND_API_KEY));
  }
  return _resend;
}

// Wraps Resend's HTML in a minimal vessel-branded shell.
export function buildEmailHtml(subject: string, body: string): string {
  const safeBody = body.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, Segoe UI, sans-serif; background:#f8fafc; padding:24px; color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:20px;border:1px solid #e2e8f0">
    <h1 style="margin:0 0 8px;font-size:18px">${subject}</h1>
    <p style="margin:0;color:#334155;white-space:pre-wrap">${safeBody}</p>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">Thor · M/Y Anne-Marie</p>
  </div>
</body></html>`;
}

// Caller (the cron route) authenticates via the CRON_SECRET header. Returns
// true if the request is from Vercel cron or carries the right secret.
export function isCronAuthorized(request: Request): boolean {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (!secret) {
    // No secret configured — be strict: require Vercel's cron header.
    return request.headers.get("x-vercel-cron") !== null;
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  // Vercel cron also calls us with x-vercel-cron header — accept that too.
  return request.headers.get("x-vercel-cron") !== null;
}
