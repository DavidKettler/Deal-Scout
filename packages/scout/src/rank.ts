import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaMessageParam, BetaToolUnion } from "@anthropic-ai/sdk/resources/beta/messages";
import { z } from "zod";
import type { Profile } from "@deal-scout/core";
import type { Candidates } from "./gather.ts";

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const MAX_CONTINUATIONS = 6;

const ReportSchema = z.strictObject({
  headline: z.string(),
  deals: z.array(
    z.strictObject({ title: z.string(), url: z.string(), price: z.string(), was_price: z.string().nullable(), why: z.string() }),
  ),
  samples: z.array(
    z.strictObject({ title: z.string(), url: z.string(), why: z.string(), expires: z.string().nullable() }),
  ),
  settlements: z.array(
    z.strictObject({
      title: z.string(),
      url: z.string(),
      deadline: z.string().nullable(),
      payout: z.string().nullable(),
      why_you_may_qualify: z.string(),
      proof_required: z.string().nullable(),
    }),
  ),
});
export type Report = z.infer<typeof ReportSchema>;

const { $schema: _, ...reportJsonSchema } = z.toJSONSchema(ReportSchema) as Record<string, unknown>;

const SYSTEM = `You are a personal deal-scout. You receive a user profile and candidate items from RSS feeds.
Your job: pick only items that genuinely fit the profile, and use web search to (a) verify a deal is live
and the discount is real (not an inflated "was" price), (b) find a few additional strong matches the feeds missed,
and (c) find open class action settlements the user may qualify for based on purchase_history and location.

Rules:
- Every url you report MUST come from the candidate list or from a web search result. Never construct or guess URLs.
  For settlements, prefer the official settlement administrator site over news coverage.
- Skip anything matching brands_avoid, above budget (unless buy-it-for-life and noted), or below min_discount_pct.
- Settlements: only OPEN ones with a future claim deadline. Explain which profile fact matches. Note if proof of purchase is required.
  Dates as YYYY-MM-DD, or null if unknown.
- Samples: skip sketchy data-harvesting "survey" offers; prefer brand-direct offers.
- When you are done researching, call submit_report exactly once with your final results.`;

const TOOLS: BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 12 },
  {
    name: "submit_report",
    description: "Submit the final filtered and verified results. Call once, after research is complete.",
    input_schema: reportJsonSchema as Anthropic.Beta.BetaTool.InputSchema,
    strict: true,
  },
];

export type Usage = { input_tokens: number; output_tokens: number; web_search_requests: number; requests: number };

export async function rank(profile: Profile, candidates: Candidates) {
  const client = new Anthropic();
  const { feeds: _feeds, ...profileForModel } = profile;
  const today = new Date().toISOString().slice(0, 10);
  const messages: BetaMessageParam[] = [
    {
      role: "user",
      content: `Today is ${today}.
PROFILE:\n${JSON.stringify(profileForModel, null, 2)}
CANDIDATES:\n${JSON.stringify(candidates, null, 2)}
Return at most ${profile.max_items_per_section} items per section.`,
    },
  ];
  const usage: Usage = { input_tokens: 0, output_tokens: 0, web_search_requests: 0, requests: 0 };
  const searchUrls = new Set<string>();

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const msg: BetaMessage = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        system: SYSTEM,
        tools: TOOLS,
        messages,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      .finalMessage();

    usage.requests++;
    usage.input_tokens += msg.usage.input_tokens;
    usage.output_tokens += msg.usage.output_tokens;
    usage.web_search_requests += msg.usage.server_tool_use?.web_search_requests ?? 0;
    for (const block of msg.content)
      if (block.type === "web_search_tool_result" && Array.isArray(block.content))
        for (const r of block.content) searchUrls.add(r.url);

    if (msg.stop_reason === "refusal")
      throw new Error(`Claude declined: ${msg.stop_details?.category ?? "unknown"} ${msg.stop_details?.explanation ?? ""}`);
    if (msg.stop_reason === "max_tokens") throw new Error("Hit max_tokens before submit_report");

    const submit = msg.content.find((b) => b.type === "tool_use" && b.name === "submit_report");
    if (submit && submit.type === "tool_use") return { report: ReportSchema.parse(submit.input), usage, searchUrls, model: msg.model };

    // pause_turn: resend as-is and the server resumes. end_turn without the tool: nudge once more.
    messages.push({ role: "assistant", content: msg.content });
    if (msg.stop_reason !== "pause_turn")
      messages.push({ role: "user", content: "Call submit_report now with your final results." });
  }
  throw new Error(`No submit_report after ${MAX_CONTINUATIONS} continuations`);
}
