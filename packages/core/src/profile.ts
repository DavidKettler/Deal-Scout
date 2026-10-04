import fs from "node:fs";
import { z } from "zod";
import { fromRoot, loadEnv } from "./env.ts";

/** Scout-facing profile. Goes to the PROFILE_JSON secret — no address/phone/DOB here (that's identity.json). */
export const ProfileSchema = z.looseObject({
  name: z.string(),
  location: z.object({ city: z.string(), state: z.string(), zip: z.string() }),
  interests: z.array(z.string()).default([]),
  brands_like: z.array(z.string()).default([]),
  brands_avoid: z.array(z.string()).default([]),
  budget: z.looseObject({ default_max_usd: z.number(), notes: z.string().optional() }),
  sizes: z.record(z.string(), z.string()).default({}),
  purchase_history: z.array(z.string()).default([]),
  min_discount_pct: z.number().default(25),
  max_items_per_section: z.number().int().positive().default(8),
  feeds: z.object({
    deals: z.array(z.url()).default([]),
    samples: z.array(z.url()).default([]),
    settlements: z.array(z.url()).default([]),
  }),
});
export type Profile = z.infer<typeof ProfileSchema>;

export function loadProfile(): Profile {
  loadEnv();
  if (process.env.PROFILE_JSON) return ProfileSchema.parse(JSON.parse(process.env.PROFILE_JSON));
  const file = fromRoot("config/profile.json");
  if (fs.existsSync(file)) return ProfileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  throw new Error("No profile: set PROFILE_JSON or create config/profile.json (see config/profile.example.json)");
}
