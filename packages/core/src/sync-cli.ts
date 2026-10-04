import { openDb } from "./db.ts";
import { sync } from "./sync.ts";

const args = new Set(process.argv.slice(2));
const db = await openDb();
const r = await sync(db, { pull: !args.has("--no-pull"), push: !args.has("--no-push") });
db.$client.close();
console.log(
  `sync: ${r.newRuns} new run(s), ${r.added} new item(s), ${r.items} total` +
    (r.committed ? ", status committed" : "") +
    (r.pushed ? ", pushed" : ""),
);
