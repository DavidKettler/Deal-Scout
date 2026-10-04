import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Postgres-portable on purpose: text ids, integer ms timestamps, JSON in text columns.

export const ITEM_KINDS = ["deal", "sample", "settlement"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const STATUSES = [
  "new",
  "approved",
  "prefilling",
  "ready_for_review",
  "submitted",
  "skipped",
  "failed",
  "manual",
] as const;
export type Status = (typeof STATUSES)[number];

export const ACTORS = ["scout", "worker", "user", "inbox"] as const;
export type Actor = (typeof ACTORS)[number];

export type ItemDetails = {
  price?: string;
  was_price?: string;
  payout?: string;
  proof_required?: string;
  why_you_may_qualify?: string;
  source?: string;
};

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  model: text("model").notNull(),
  headline: text("headline"),
  candidateCounts: text("candidate_counts", { mode: "json" }).$type<Record<string, number>>(),
  usage: text("usage", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  ingestedAt: ts("ingested_at").notNull(),
});

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ITEM_KINDS }).notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    status: text("status", { enum: STATUSES }).notNull().default("new"),
    statusReason: text("status_reason"),
    why: text("why"),
    details: text("details", { mode: "json" }).$type<ItemDetails>().notNull().default({}),
    /** ISO date (YYYY-MM-DD) claim/offer deadline, if known */
    deadline: text("deadline"),
    /** sign-up address alias used by the worker (phase 3) */
    signupAlias: text("signup_alias"),
    runId: text("run_id").references(() => runs.id),
    notes: text("notes"),
    firstSeenAt: ts("first_seen_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
    statusChangedAt: ts("status_changed_at").notNull(),
  },
  (t) => [index("items_status_idx").on(t.status), index("items_kind_idx").on(t.kind)],
);

export const itemEvents = sqliteTable(
  "item_events",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    fromStatus: text("from_status", { enum: STATUSES }),
    toStatus: text("to_status", { enum: STATUSES }).notNull(),
    actor: text("actor", { enum: ACTORS }).notNull(),
    message: text("message"),
    at: ts("at").notNull(),
  },
  (t) => [index("item_events_item_idx").on(t.itemId)],
);

export const STOP_REASONS = [
  "captcha",
  "attestation",
  "final_submit",
  "bot_detected",
  "login_required",
  "no_form",
  "error",
] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export type FillStep = { selector: string; action: "fill" | "select" | "check"; profilePath: string };

export const prefillAttempts = sqliteTable(
  "prefill_attempts",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    outcome: text("outcome", { enum: ["ready_for_review", "manual", "failed"] }),
    stopReason: text("stop_reason", { enum: STOP_REASONS }),
    finalUrl: text("final_url"),
    storageStatePath: text("storage_state_path"),
    screenshotPath: text("screenshot_path"),
    fillPlan: text("fill_plan", { mode: "json" }).$type<FillStep[]>(),
    unfilledRequired: text("unfilled_required", { mode: "json" }).$type<string[]>(),
    error: text("error"),
  },
  (t) => [index("prefill_attempts_item_idx").on(t.itemId)],
);

export const fieldMappings = sqliteTable(
  "field_mappings",
  {
    domain: text("domain").notNull(),
    formSignature: text("form_signature").notNull(),
    mapping: text("mapping", { mode: "json" }).$type<FillStep[]>().notNull(),
    source: text("source", { enum: ["claude", "override"] }).notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.domain, t.formSignature] })],
);

export const emails = sqliteTable(
  "emails",
  {
    messageId: text("message_id").primaryKey(),
    receivedAt: ts("received_at").notNull(),
    from: text("from").notNull(),
    toAlias: text("to_alias"),
    subject: text("subject").notNull(),
    kind: text("kind", { enum: ["confirmation", "verification", "shipping", "other"] }).notNull(),
    itemId: text("item_id").references(() => items.id),
    matchMethod: text("match_method", { enum: ["alias", "domain", "claude"] }),
    links: text("links", { mode: "json" }).$type<string[]>(),
  },
  (t) => [index("emails_item_idx").on(t.itemId)],
);

export type Item = typeof items.$inferSelect;
export type ItemEvent = typeof itemEvents.$inferSelect;
export type Run = typeof runs.$inferSelect;
