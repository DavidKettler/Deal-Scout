import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { REPO_ROOT, storeDir } from "./env.ts";
import { ITEM_KINDS, STATUSES } from "./schema.ts";
import { RunFileSchema, type RunFile } from "./run.ts";

// The "store" is a checkout of the orphan `data` branch (data/sync locally, a plain checkout on CI).
// Layout: runs/<runId>.json (append-only), seen.json (scout dedupe), status.json (written locally, no PII).

const BRANCH = "data";
const git = (args: string[], cwd = REPO_ROOT) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (args: string[], cwd?: string) => {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
};

const hasRemote = () => tryGit(["remote", "get-url", "origin"]) !== null;
const remoteHasBranch = () => hasRemote() && !!tryGit(["ls-remote", "--heads", "origin", BRANCH]);

/** Make sure the store exists. Locally this creates/attaches the data-branch worktree; on CI the workflow does. */
export function ensureStore(): string {
  const dir = storeDir();
  if (!process.env.CI && !fs.existsSync(path.join(dir, ".git"))) {
    if (remoteHasBranch()) {
      git(["fetch", "origin", BRANCH]);
      if (tryGit(["rev-parse", "--verify", BRANCH])) git(["worktree", "add", dir, BRANCH]);
      else git(["worktree", "add", "-b", BRANCH, dir, `origin/${BRANCH}`]);
    } else if (tryGit(["rev-parse", "--verify", BRANCH])) {
      git(["worktree", "add", dir, BRANCH]);
    } else {
      git(["worktree", "add", "--orphan", "-b", BRANCH, dir]);
    }
  }
  fs.mkdirSync(path.join(dir, "runs"), { recursive: true });
  return dir;
}

export function pullStore(dir: string) {
  if (remoteHasBranch()) git(["pull", "--rebase", "origin", BRANCH], dir);
}

/** Commits the given paths if they changed. Returns true if a commit was made. */
export function commitStore(dir: string, paths: string[], message: string): boolean {
  git(["add", "--", ...paths], dir);
  if (tryGit(["diff", "--cached", "--quiet"], dir) !== null) return false;
  git(["commit", "-m", message], dir);
  return true;
}

export function pushStore(dir: string): boolean {
  if (!hasRemote()) return false;
  git(["push", "origin", `HEAD:${BRANCH}`], dir);
  return true;
}

// ---------- runs ----------
export function writeRunFile(dir: string, run: RunFile) {
  const rel = path.join("runs", `${run.id}.json`);
  fs.writeFileSync(path.join(dir, rel), JSON.stringify(run, null, 2) + "\n");
  return rel;
}

export function readRunFiles(dir: string): RunFile[] {
  const runsDir = path.join(dir, "runs");
  if (!fs.existsSync(runsDir)) return [];
  return fs
    .readdirSync(runsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => RunFileSchema.parse(JSON.parse(fs.readFileSync(path.join(runsDir, f), "utf8"))));
}

// ---------- seen (normalized url → epoch ms) ----------
export function loadSeen(dir: string, ttlDays: number): Record<string, number> {
  try {
    const seen: Record<string, number> = JSON.parse(fs.readFileSync(path.join(dir, "seen.json"), "utf8"));
    const cutoff = Date.now() - ttlDays * 864e5;
    return Object.fromEntries(Object.entries(seen).filter(([, t]) => t > cutoff));
  } catch {
    return {};
  }
}
export function saveSeen(dir: string, seen: Record<string, number>) {
  fs.writeFileSync(path.join(dir, "seen.json"), JSON.stringify(seen) + "\n");
}

// ---------- status snapshot (local → CI) ----------
export const StatusFileSchema = z.object({
  generatedAt: z.iso.datetime(),
  items: z.record(
    z.string(),
    z.object({ kind: z.enum(ITEM_KINDS), status: z.enum(STATUSES), title: z.string() }),
  ),
});
export type StatusFile = z.infer<typeof StatusFileSchema>;

export function readStatus(dir: string): StatusFile | null {
  try {
    return StatusFileSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, "status.json"), "utf8")));
  } catch {
    return null;
  }
}
