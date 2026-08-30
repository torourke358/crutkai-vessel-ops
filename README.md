# Runa (yacht ops) — M/Y Anne-Marie

PWA for M/Y Anne-Marie. Unifies inventory, equipment, maintenance, and yard period management against a single Postgres database (shared with [crutkai-petty-cash](https://github.com/torourke358/crutkai-petty-cash)). The repo directory is still named `crutkai-vessel-ops` for git-history continuity; the brand name is **Runa**.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **Supabase** — Auth + Postgres + Storage (RLS-everywhere)
- **Anthropic Claude** (`claude-sonnet-5`) for PDF-to-row migration and the dry-dock planner vision analysis
- **Resend** for transactional email notifications
- **Vercel** — hosting + cron (outbox drains every 5 min; up to 25 emails per run)

## Dry-dock disassembly planner

`/yard/planner` (admin): photograph an area of the vessel before a yard
period; Claude vision identifies the visible equipment and returns the
fastest safe disassembly ORDER, flagging blockers — e.g. an AC unit that must
come out before engine work because the AC contractor has a ~2-week lead
time. Plans are editable drafts (`disassembly_plans` + `disassembly_steps`,
photos in the private `disassembly-photos` bucket — migration
`15_drydock_planner.sql`), then convert one-task-per-step into a yard
period's Engineering quadrant.

## Spreadsheet imports

- **Inventory** — `/inventory/import` now takes CSV/XLSX alongside PDF/photo;
  headers (part name, make, qty, unit, location, supplier, unit price,
  critical threshold…) are matched heuristically, then the usual preview →
  commit flow runs.
- **Prior yard periods** — `/yard/import` (admin): upload a past period's
  task list (CSV/XLSX), edit the parsed rows, and commit; creates a closed
  yard period with tasks mapped to quadrants by area name (Engineering
  fallback). Parsers live in `src/lib/csv.ts` (`parseCsv`) and
  `src/lib/spreadsheet.ts` (exceljs).

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
