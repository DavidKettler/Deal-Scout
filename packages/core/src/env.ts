import fs from "node:fs";
import path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
export const DATA_DIR = path.join(REPO_ROOT, "data");

let loaded = false;
/** Load repo-root .env once. Real env vars win (CI sets them via secrets). */
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const file = path.join(REPO_ROOT, ".env");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

/** Resolve a path relative to the repo root unless already absolute. */
export const fromRoot = (p: string) => (path.isAbsolute(p) ? p : path.join(REPO_ROOT, p));

export const storeDir = () => fromRoot(process.env.SCOUT_STORE || "data/sync");
