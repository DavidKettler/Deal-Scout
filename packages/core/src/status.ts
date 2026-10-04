import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "./db.ts";
import { itemEvents, items, type Actor, type ItemKind, type Status } from "./schema.ts";

const CLAIM_FLOW: Record<Status, readonly Status[]> = {
  new: ["approved", "skipped"],
  approved: ["prefilling", "skipped"],
  prefilling: ["ready_for_review", "manual", "failed"],
  ready_for_review: ["submitted", "skipped", "approved", "manual"],
  failed: ["approved", "skipped", "manual"],
  manual: ["submitted", "skipped"],
  submitted: [],
  skipped: [],
};

// Deals never enter the claim queue: dismiss, or mark bought.
const DEAL_FLOW: Partial<Record<Status, readonly Status[]>> = {
  new: ["skipped", "submitted"],
};

export function allowedTransitions(kind: ItemKind, from: Status): readonly Status[] {
  return (kind === "deal" ? DEAL_FLOW[from] : CLAIM_FLOW[from]) ?? [];
}

export const canTransition = (kind: ItemKind, from: Status, to: Status) => allowedTransitions(kind, from).includes(to);

export class TransitionError extends Error {}

/**
 * The only way to change an item's status. Guarded UPDATE (doubles as the worker's job claim)
 * plus an audit row, in one transaction. Pass `from` to require a specific current status.
 */
export async function transition(
  db: Db,
  opts: { id: string; to: Status; actor: Actor; from?: Status; reason?: string },
) {
  return db.transaction(async (tx) => {
    const [item] = await tx.select({ kind: items.kind, status: items.status }).from(items).where(eq(items.id, opts.id));
    if (!item) throw new TransitionError(`No item ${opts.id}`);
    const from = opts.from ?? item.status;
    if (item.status !== from) throw new TransitionError(`Item ${opts.id} is ${item.status}, expected ${from}`);
    if (!canTransition(item.kind, from, opts.to))
      throw new TransitionError(`${item.kind}: ${from} → ${opts.to} not allowed`);

    const now = new Date();
    const updated = await tx
      .update(items)
      .set({ status: opts.to, statusReason: opts.reason ?? null, statusChangedAt: now, updatedAt: now })
      .where(and(eq(items.id, opts.id), eq(items.status, from)))
      .returning({ id: items.id });
    if (!updated.length) throw new TransitionError(`Item ${opts.id} changed concurrently`);

    await tx.insert(itemEvents).values({
      id: randomUUID(),
      itemId: opts.id,
      fromStatus: from,
      toStatus: opts.to,
      actor: opts.actor,
      message: opts.reason ?? null,
      at: now,
    });
    return { from, to: opts.to };
  });
}
