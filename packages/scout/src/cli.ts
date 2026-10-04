import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import {
  DATA_DIR,
  commitStore,
  domainOf,
  ensureStore,
  itemId,
  loadEnv,
  loadProfile,
  loadSeen,
  normalizeUrl,
  openDb,
  readStatus,
  runIdFor,
  saveSeen,
  sync,
  writeRunFile,
  type RunFile,
  type RunItem,
} from "@deal-scout/core";
import { renderDigest } from "./digest.ts";
import { gather } from "./gather.ts";
import { MODEL, rank, type Report } from "./rank.ts";

const SEEN_TTL_DAYS = 30;
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry") || !!process.env.DRY_RUN;
const INGEST = !process.env.CI && !args.has("--no-ingest");

loadEnv();
const profile = loadProfile();
const store = ensureStore();
const seen = loadSeen(store, SEEN_TTL_DAYS);
const status = readStatus(store);
// Anything already in the queue (any status) is never re-surfaced.
const known = new Set(Object.keys(status?.items ?? {}));
const isKnown = (url: string) => {
  try {
    return !!seen[normalizeUrl(url)] || known.has(itemId(url));
  } catch {
    return true; // unparseable URL
  }
};

const startedAt = new Date();
const candidates = await gather(profile.feeds, isKnown);
const candidateCounts = Object.fromEntries(Object.entries(candidates).map(([k, v]) => [k, v.length]));
console.log("Candidates:", candidateCounts);

const run: RunFile = {
  version: 1,
  id: runIdFor(startedAt),
  startedAt: startedAt.toISOString(),
  finishedAt: startedAt.toISOString(),
  model: MODEL,
  headline: null,
  candidateCounts,
  usage: {},
  error: null,
  items: [],
};

try {
  const { report, usage, searchUrls, model } = await rank(profile, candidates);
  const allowed = new Set(
    [...Object.values(candidates).flat().map((c) => c.url), ...searchUrls].flatMap((u) => {
      try {
        return [normalizeUrl(u)];
      } catch {
        return [];
      }
    }),
  );
  run.items = toRunItems(report, allowed);
  run.headline = report.headline;
  run.usage = usage;
  run.model = model;
  console.log(`Ranked: ${run.items.length} items, usage`, usage);
} catch (e) {
  run.error = (e as Error).message;
  console.error("Rank failed:", e);
}
run.finishedAt = new Date().toISOString();

const runPath = writeRunFile(store, run);
// Only mark things seen when ranking succeeded; a failed night retries the same candidates tomorrow.
if (!run.error) {
  const now = Date.now();
  for (const c of Object.values(candidates).flat()) seen[normalizeUrl(c.url)] = now;
  for (const i of run.items) seen[normalizeUrl(i.url)] = now;
  saveSeen(store, seen);
}
console.log(`Wrote ${runPath}`);

if (!run.error) {
  const html = renderDigest(run, status);
  if (DRY_RUN) {
    const out = path.join(DATA_DIR, "report.html");
    fs.writeFileSync(out, html);
    console.log(`DRY_RUN: wrote ${out}`);
  } else {
    await sendDigest(html, `Nightly deals · ${startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    console.log("Digest sent.");
  }
}

if (INGEST) {
  commitStore(store, ["runs", "seen.json"], `scout (local): ${run.id}`);
  const db = await openDb();
  const r = await sync(db, { pull: false, push: false });
  db.$client.close();
  console.log(`Ingested locally: ${r.added} new item(s). Run \`pnpm sync\` to push.`);
}
if (run.error) process.exitCode = 1;

// ---------- helpers ----------
function toRunItems(report: Report, allowed: Set<string>): RunItem[] {
  const out = new Map<string, RunItem>();
  const add = (kind: RunItem["kind"], r: { title: string; url: string }, rest: Omit<RunItem, "id" | "kind" | "title" | "url" | "domain">) => {
    let norm: string;
    try {
      norm = normalizeUrl(r.url);
    } catch {
      return console.warn(`Dropped (bad url): ${r.url}`);
    }
    if (!allowed.has(norm)) return console.warn(`Dropped (url not from feeds or search results): ${r.url}`);
    const id = itemId(r.url);
    if (known.has(id) || out.has(id)) return;
    out.set(id, { id, kind, title: r.title, url: r.url, domain: domainOf(r.url), ...rest });
  };
  const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const compact = (o: Record<string, string | null>) =>
    Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => e[1] != null));

  for (const d of report.deals) add("deal", d, { why: d.why, details: compact({ price: d.price, was_price: d.was_price }) });
  for (const s of report.samples) add("sample", s, { why: s.why, deadline: isoDate(s.expires), details: {} });
  for (const s of report.settlements)
    add("settlement", s, {
      why: s.why_you_may_qualify,
      deadline: isoDate(s.deadline),
      details: compact({ payout: s.payout, proof_required: s.proof_required, deadline_text: s.deadline }),
    });
  return [...out.values()];
}

async function sendDigest(html: string, subject: string) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, TO_EMAIL } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !TO_EMAIL) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD / TO_EMAIL not set");
  const t = nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
  await t.sendMail({ from: GMAIL_USER, to: TO_EMAIL, subject, html });
}
