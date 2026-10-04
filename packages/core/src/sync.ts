import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db.ts";
import { ingestRun } from "./run.ts";
import { runs, items } from "./schema.ts";
import { commitStore, ensureStore, pullStore, pushStore, readRunFiles, type StatusFile } from "./store.ts";

/** Pull the data branch, ingest unseen runs, publish status.json, push. */
export async function sync(db: Db, opts: { pull?: boolean; push?: boolean } = {}) {
  const dir = ensureStore();
  if (opts.pull !== false) pullStore(dir);

  const ingested = new Set((await db.select({ id: runs.id }).from(runs)).map((r) => r.id));
  let newRuns = 0;
  let added = 0;
  for (const run of readRunFiles(dir)) {
    if (ingested.has(run.id)) continue;
    added += (await ingestRun(db, run)).added;
    newRuns++;
  }

  const rows = await db.select({ id: items.id, kind: items.kind, status: items.status, title: items.title }).from(items);
  const status: StatusFile = {
    generatedAt: new Date().toISOString(),
    items: Object.fromEntries(rows.map(({ id, ...rest }) => [id, rest])),
  };
  // Only rewrite when statuses changed, so generatedAt churn doesn't create empty commits.
  const file = path.join(dir, "status.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).items : null;
  if (JSON.stringify(prev) !== JSON.stringify(status.items)) fs.writeFileSync(file, JSON.stringify(status, null, 2) + "\n");

  const committed = commitStore(dir, ["runs", "status.json"], `sync: ${rows.length} items`);
  const pushed = committed && opts.push !== false ? pushStore(dir) : false;
  return { newRuns, added, items: rows.length, committed, pushed };
}
