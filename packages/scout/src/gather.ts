import Parser from "rss-parser";
import type { Profile } from "@deal-scout/core";

export type Section = "deals" | "samples" | "settlements";
export type Candidate = { title: string; url: string; snippet: string; source: string };
export type Candidates = Record<Section, Candidate[]>;

export const USER_AGENT = "personal-deal-digest/2.0 (single user, nightly)";
const PER_FEED = 40;

const parser = new Parser({ timeout: 15000, headers: { "User-Agent": USER_AGENT } });

/** Sequential on purpose: one request at a time, failures skipped. */
export async function gather(feeds: Profile["feeds"], skip: (url: string) => boolean): Promise<Candidates> {
  const out: Candidates = { deals: [], samples: [], settlements: [] };
  for (const section of Object.keys(out) as Section[]) {
    for (const feedUrl of feeds[section]) {
      try {
        const feed = await parser.parseURL(feedUrl);
        for (const item of feed.items.slice(0, PER_FEED)) {
          const url = item.link?.trim();
          if (!url || !item.title || skip(url)) continue;
          out[section].push({
            title: item.title.trim(),
            url,
            snippet: (item.contentSnippet ?? "").slice(0, 400),
            source: new URL(feedUrl).hostname,
          });
        }
      } catch (e) {
        console.warn(`Feed failed (${feedUrl}): ${(e as Error).message}`);
      }
    }
  }
  return out;
}
