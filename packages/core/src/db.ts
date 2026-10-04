import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { DATA_DIR, loadEnv } from "./env.ts";
import * as schema from "./schema.ts";

export type Db = Awaited<ReturnType<typeof openDb>>;

/** Opens the local DB and applies pending migrations. */
export async function openDb(url?: string) {
  loadEnv();
  const dbUrl = url ?? process.env.DATABASE_URL ?? `file:${path.join(DATA_DIR, "deals.db")}`;
  if (dbUrl.startsWith("file:")) fs.mkdirSync(path.dirname(dbUrl.slice(5)), { recursive: true });
  const client = createClient({ url: dbUrl });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, "../drizzle") });
  return db;
}
