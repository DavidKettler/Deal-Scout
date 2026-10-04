# deal-scout

Personal deal / free-sample / class-action-settlement scout with a human-in-the-loop claim queue.
Single user. Private repo. Local-first.

## Hard constraints (never relax these, even if asked in passing — confirm explicitly first)

- **No CAPTCHA solving, stealth/anti-detection plugins, fingerprint spoofing, or solver services.**
  When the worker hits a CAPTCHA or bot detection it stops, records `stop_reason`, and hands off to the human.
- **Never submit a settlement claim form and never tick an attestation box.** Those are sworn statements.
  On settlement forms the worker fills identity/contact fields only — never eligibility questions, never
  "I certify / under penalty of perjury / I declare" checkboxes, never terms acceptance, never final submit.
  These guards live in code (`packages/worker/src/gates.ts`), not only in prompts.
- **Never click a submit-type control** on any form, samples included. The human submits.
- **Marketing opt-ins stay unchecked.**
- **One browser at a time** (shared lock between prefill worker and Finish handoff). Polite, honest
  User-Agent. Respect rate limits; on a block, mark the item `manual` and move on — don't retry around it.
- **Secrets and personal data never get committed.** `.env`, `config/profile.json`, `config/identity.json`,
  and everything in `data/` are gitignored. CI gets them via GitHub secrets.
- **Identity data (address, phone, DOB, sign-up email) never leaves the machine**: not in GitHub secrets,
  not in the `data` branch, not sent to Claude. Claude maps form fields to profile *paths*; values are
  filled locally.
- The inbox watcher never clicks links in emails. Verification links are surfaced in the dashboard.

## Layout

```
packages/core      Drizzle schema, DB client, queue state machine, ids, profile schemas, run ingest
packages/scout     nightly RSS gather → Claude rank/verify (web_search) → run file + email digest
packages/worker    Playwright prefill + Finish handoff (phase 3)
packages/inbox     IMAP watcher (phase 4)
apps/api           Hono API between dashboard and DB/worker (phase 2)
apps/dashboard     Vite + React + TS queue UI (phase 2)
config/            *.example.json committed; real profile/identity gitignored; sites/<domain>.json overrides
data/              gitignored: deals.db, state/, shots/, sync/ (worktree of the `data` branch)
```

## Data flow

- Scout runs nightly on GitHub Actions. It has no DB. It writes `runs/<timestamp>.json` and `seen.json`
  into the **`data` branch** (orphan branch, same private repo), checked out at `data/sync`.
- Locally, `pnpm sync` pulls the data branch, ingests run files into SQLite (idempotent — item id is a hash
  of the normalized URL), writes `status.json` (item id → status, **no PII**), and pushes.
- Ownership on the data branch: `runs/` is append-only with unique timestamped names (CI or a local scout run);
  `seen.json` is written by scout; `status.json` only by local sync. Don't edit another writer's files.
- A failed rank still writes a run file (with `error`) but does NOT update `seen.json`, so candidates retry next night.
- Local SQLite (`data/deals.db`) is the source of truth for queue state.

## Queue state machine (`packages/core/src/status.ts` is authoritative)

```
new → approved | skipped
approved → prefilling | skipped
prefilling → ready_for_review | manual | failed
ready_for_review → submitted | skipped | approved (re-prefill) | manual
failed → approved | skipped | manual
manual → submitted | skipped
```
Deals don't enter the claim queue: `new → skipped | submitted` ("bought").
`confirmed` (inbox) and `expired` (deadline passed) are derived badges, not states.
Every status change goes through `transition()`: a guarded `UPDATE … WHERE status = <from>` plus an
`item_events` row. Never write `items.status` directly.

## Conventions

- TypeScript everywhere, ESM, run with `tsx` (no build step for internal packages; they export `src/`).
- pnpm workspaces. Node ≥ 22 (CI uses 24; local Mac has Node 26 at `/opt/homebrew/bin`, which is not on
  the default non-interactive PATH — prefix commands with `export PATH=/opt/homebrew/bin:$PATH`).
- DB: Drizzle + libSQL (`@libsql/client`, file URL). Keep schema Postgres-portable: text ids, integer
  ms timestamps, JSON in text columns, no SQLite-only SQL. Migrations via `pnpm db:generate` (drizzle-kit);
  they're applied automatically by `openDb()`.
- Validate all external input (profile files, Claude output, RSS) with zod at the boundary.
- Claude API: `@anthropic-ai/sdk`, model from `CLAUDE_MODEL` (default `claude-sonnet-5-5`). Use the
  current server tool versions (`web_search_20260209`), handle `pause_turn` and `refusal`, get structured
  results via a strict client tool (structured outputs are incompatible with web-search citations).
- Env: `.env` at repo root, loaded by `loadEnv()` in core. See `.env.example`.
- Keep the app small. Don't add abstractions until a second caller exists.

## Build phases

1. Monorepo + core schema + scout writing to the DB  ← done when `pnpm scout --dry` + `pnpm sync` work
2. Dashboard queue view (read-only) + API
3. Prefill worker with pause-and-handoff
4. Inbox watcher + digest integration

## Commands

```
pnpm install
pnpm typecheck
pnpm scout --dry          # gather + rank, write data/report.html, no email; ingests locally
pnpm scout                # same, sends email digest
pnpm sync                 # pull data branch, ingest runs, push status.json
pnpm db:generate          # after editing packages/core/src/schema.ts
```
