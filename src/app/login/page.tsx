"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(then: "/" | "/account/password") {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError("That email and password didn't match. Try again.");
      setLoading(false);
      return;
    }

    // Full navigation so the proxy picks up the fresh session cookie.
    router.push(then);
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    signIn("/");
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt="Thor's hammer"
            className="h-24 w-24 rounded-2xl ring-1 ring-slate-200"
          />
          <h1 className="mt-4 text-5xl font-bold tracking-tight text-slate-900">
            Thor
          </h1>
          <p className="mt-1 text-base font-medium text-slate-700">
            Anne-Marie Vessel Ops
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to manage inventory, maintenance, and yard tasks.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => signIn("/account/password")}
            className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            Change my password
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Forgot your password? Email Tim to reset it.
        </p>
      </div>
    </main>
  );
}
