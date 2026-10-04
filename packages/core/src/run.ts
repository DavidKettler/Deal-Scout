import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db.ts";
import { ITEM_KINDS, itemEvents, items, runs } from "./schema.ts";

/** Contract between scout (writer, possibly on CI) and local ingest. Bump `version` on breaking changes. */
export const RunItemSchema = z.object({
  id: z.string(),
  kind: z.enum(ITEM_KINDS),
  title: z.string(),
  url: z.url(),
  domain: z.string(),
  why: z.string().nullish(),
  deadline: z.string().nullish(),
  details: z.record(z.string(), z.string()).default({}),
});
export type RunItem = z.infer<typeof RunItemSchema>;

export const RunFileSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  model: z.string(),
  headline: z.string().nullish(),
  candidateCounts: z.record(z.string(), z.number()),
  usage: z.record(z.string(), z.unknown()).default({}),
  error: z.string().nullish(),
  items: z.array(RunItemSchema),
});
export type RunFile = z.infer<typeof RunFileSchema>;

/** Run ids double as filenames: 2026-10-04T02-00-03Z */
export const runIdFor = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z").replaceAll(":", "-");

/** Idempotent. New items land as `new`; known items get refreshed details but keep their status. */
export async function ingestRun(db: Db, run: RunFile) {
  return db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .insert(runs)
      .values({
        id: run.id,
        startedAt: new Date(run.startedAt),
        finishedAt: new Date(run.finishedAt),
        model: run.model,
        headline: run.headline ?? null,
        candidateCounts: run.candidateCounts,
        usage: run.usage,
        error: run.error ?? null,
        ingestedAt: now,
      })
      .onConflictDoNothing();

    if (!run.items.length) return { added: 0, refreshed: 0 };
    const ids = run.items.map((i) => i.id);
    const known = new Set(
      (await tx.select({ id: items.id }).from(items).where(inArray(items.id, ids))).map((r) => r.id),
    );

    for (const i of run.items) {
      await tx
        .insert(items)
        .values({
          id: i.id,
          kind: i.kind,
          title: i.title,
          url: i.url,
          domain: i.domain,
          why: i.why ?? null,
          deadline: i.deadline ?? null,
          details: i.details,
          runId: run.id,
          firstSeenAt: new Date(run.startedAt),
          updatedAt: now,
          statusChangedAt: now,
        })
        .onConflictDoUpdate({
          target: items.id,
          set: { title: i.title, why: i.why ?? null, deadline: sql`coalesce(excluded.deadline, ${items.deadline})`, details: i.details, updatedAt: now },
        });
      if (!known.has(i.id))
        await tx.insert(itemEvents).values({
          id: randomUUID(),
          itemId: i.id,
          fromStatus: null,
          toStatus: "new",
          actor: "scout",
          message: `run ${run.id}`,
          at: now,
        });
    }
    return { added: ids.length - known.size, refreshed: known.size };
  });
}
