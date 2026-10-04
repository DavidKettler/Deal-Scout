import { createHash } from "node:crypto";

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_[ce]id$|ref$|ref_src$|tag$|ascsubtag$)/i;

/** Canonical form used for ids and dedupe: lowercase host, no www, no hash, no tracking params, no trailing slash. */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

/** Stable item id: known before the item reaches the local DB, so digest links work pre-sync. */
export const itemId = (url: string) => createHash("sha256").update(normalizeUrl(url)).digest("hex").slice(0, 16);

export const domainOf = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");
