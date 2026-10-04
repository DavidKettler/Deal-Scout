# deal-scout

Nightly deal / free-sample / settlement scout → claim queue with a human in the loop. See `CLAUDE.md` for
architecture, constraints, and the queue state machine.

## Setup (local)

```bash
export PATH=/opt/homebrew/bin:$PATH      # macOS/Homebrew: node + pnpm
pnpm install
cp .env.example .env                     # fill in ANTHROPIC_API_KEY (+ Gmail vars to send email)
cp config/profile.example.json config/profile.json   # edit: interests, purchase_history, feeds
pnpm scout --dry                         # gather + rank → data/report.html, ingests into data/deals.db
```

## GitHub (private repo)

1. Add the remote and push `main`.
2. Run `pnpm sync` once — it creates the orphan `data` branch locally (if you haven't run scout yet) and pushes it.
   (If you skip this, the first Actions run creates it instead; `pnpm sync` will then attach to it.)
3. Repo **secrets**: `ANTHROPIC_API_KEY`, `PROFILE_JSON` (contents of config/profile.json),
   `GMAIL_USER`, `GMAIL_APP_PASSWORD` (Google Account → Security → App passwords), `TO_EMAIL`.
4. Optional repo **variables**: `CLAUDE_MODEL`, `DASHBOARD_URL`.
5. Actions → "Nightly scout" → Run workflow.

## Daily use

```bash
pnpm sync      # pull last night's runs into the local DB, push your queue status back
```

## Notes

- Reddit RSS rate-limits non-browser user agents (HTTP 429). Feeds that fail are skipped, not fatal.
- `max_uses` on the web_search tool in `packages/scout/src/rank.ts` controls search cost per run.
- Cron is UTC.
