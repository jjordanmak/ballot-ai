import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { costMicroUsd } from "./config";
import { RESEARCH_SYSTEM, SUPPORT_SYSTEM, supportTask } from "./prompts";
import { SupportCheck } from "./schemas";

/**
 * The two Claude calls the research pipeline makes. Inputs are stored
 * entities (office, measure title, a person's name as printed on the
 * ballot) and the text of fetched public documents; never an address or
 * anything from a visitor's request (AI_ARCHITECTURE §2).
 */

export interface Doc {
  /** "D1", "D2"…: what answers cite. */
  id: string;
  title: string;
  url: string;
  text: string;
}

export interface CallResult<T> {
  data: T | null;
  /** Why data is null: refusal, max_tokens, parse failure, API error. */
  problem?: string;
  costMicroUsd: number;
  usage?: Anthropic.Usage;
}

export { PROMPT_VERSION } from "./prompts";



let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return client;
}

function documentsBlock(docs: Doc[]): string {
  return docs
    .map((d) => `<document id="${d.id}" title="${escapeAttr(d.title)}" url="${escapeAttr(d.url)}">\n${d.text}\n</document>`)
    .join("\n\n");
}

const escapeAttr = (s: string) => s.replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" })[c]!);

/** One structured extraction. Never throws; a failure comes back as `problem`. */
import type { Effort } from "./config";
export type { Effort };

export async function extract<S extends z.ZodType>(opts: {
  model: string;
  effort?: Effort;
  schema: S;
  task: string;
  docs: Doc[];
  client?: Pick<Anthropic, "messages">;
}): Promise<CallResult<z.infer<S>>> {
  const c = opts.client ?? anthropic();
  try {
    const res = await c.messages.parse({
      model: opts.model,
      max_tokens: 16000,
      system: [{ type: "text", text: RESEARCH_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${documentsBlock(opts.docs)}\n\n${opts.task}` }],
      output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
    });
    const cost = costMicroUsd(opts.model, res.usage);
    if (res.stop_reason === "refusal") return { data: null, problem: "refusal", costMicroUsd: cost, usage: res.usage };
    if (res.stop_reason === "max_tokens") return { data: null, problem: "max_tokens", costMicroUsd: cost, usage: res.usage };
    if (!res.parsed_output) return { data: null, problem: "unparsed", costMicroUsd: cost, usage: res.usage };
    return { data: res.parsed_output as z.infer<S>, costMicroUsd: cost, usage: res.usage };
  } catch (e) {
    return { data: null, problem: e instanceof Anthropic.APIError ? `api_${e.status ?? "error"}` : "error", costMicroUsd: 0 };
  }
}

export interface Claim {
  text: string;
  quote: string;
}

/**
 * Second pass: for each claim, does its quote, read on its own, say what the
 * text says? Unsupported claims are dropped. A failed call fails closed
 * (nothing is marked supported).
 */
export async function checkSupport(opts: {
  model: string;
  claims: Claim[];
  client?: Pick<Anthropic, "messages">;
}): Promise<{ supported: boolean[]; costMicroUsd: number; problem?: string }> {
  if (!opts.claims.length) return { supported: [], costMicroUsd: 0 };
  const c = opts.client ?? anthropic();
  const list = opts.claims.map((cl, i) => `${i + 1}. Text: ${cl.text}\n   Quote: ${cl.quote}`).join("\n");
  try {
    const res = await c.messages.parse({
      model: opts.model,
      max_tokens: 8000,
      system: SUPPORT_SYSTEM,
      messages: [
        {
          role: "user",
          content: supportTask(list),
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(SupportCheck) },
    });
    const cost = costMicroUsd(opts.model, res.usage);
    const out = opts.claims.map(() => false);
    if (res.stop_reason !== "end_turn" || !res.parsed_output) return { supported: out, costMicroUsd: cost, problem: res.stop_reason ?? "unparsed" };
    for (const r of res.parsed_output.results) if (r.n >= 1 && r.n <= out.length) out[r.n - 1] = r.supported;
    return { supported: out, costMicroUsd: cost };
  } catch (e) {
    return { supported: opts.claims.map(() => false), costMicroUsd: 0, problem: e instanceof Anthropic.APIError ? `api_${e.status ?? "error"}` : "error" };
  }
}
