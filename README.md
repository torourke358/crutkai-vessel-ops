# Runa (yacht ops) — M/Y Anne-Marie

PWA for M/Y Anne-Marie. Unifies inventory, equipment, maintenance, and yard period management against a single Postgres database (shared with [crutkai-petty-cash](https://github.com/torourke358/crutkai-petty-cash)). The repo directory is still named `crutkai-vessel-ops` for git-history continuity; the brand name is **Runa**.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **Supabase** — Auth + Postgres + Storage (RLS-everywhere)
- **Anthropic Claude** (`claude-sonnet-4-6`) for PDF-to-row migration
- **Resend** for transactional email notifications
- **Vercel** — hosting + cron (Pro plan for 1-min outbox cadence)

## Local dev

```
cp .env.example .env.local
# Fill in values from the petty-cash Supabase project (same project ref)
npm install
npm run dev
```

## Implementation plan

The full design lives outside this repo:
- Brief: `../04_vessel_ops_plan_prompt.md`
- Approved plan: `C:\Users\Owner\.claude\plans\fluffy-dancing-galaxy.md`

## Repo conventions

Inherits all patterns from `crutkai-petty-cash`:
- `user_profiles` + `is_admin()` for auth gating
- `audit_log` for every mutation (writes via `src/lib/audit.ts`)
- `cleanEnv()` for whitespace-resistant secrets
- `todayLocal()` / `monthStartLocal()` for timezone-safe date defaults
- `proxy.ts` excludes `/api/*` from the matcher so API routes return real 401 JSON
