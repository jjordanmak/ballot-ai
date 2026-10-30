import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { costMicroUsd } from "./config";
import { RESEARCH_SYSTEM, SUPPORT_SYSTEM, supportTask, synthSupportTask } from "./prompts";
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

import type { Effort } from "./config";
export type { Effort };

/** One structured extraction. Never throws; a failure comes back as `problem`. */
export async function extract<S extends z.ZodType>(opts: {
  model: string;
  effort?: Effort;
  schema: S;
  task: string;
  docs: Doc[];
  /** Instructions; defaults to the research instructions. */
  system?: string;
  client?: Pick<Anthropic, "messages">;
  /**
   * Cache the documents (synthesis): they go in their own block, ahead of
   * the task, so a person's two calls and the repair pass read them from
   * the cache. Same setting only; a different model or effort is a
   * different cache.
   */
  cacheDocs?: boolean;
  /** The repair pass: the first answer, then the repair request, after the same first turn. */
  followUp?: { answer: string; task: string };
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<CallResult<z.infer<S>>> {
  const c = opts.client ?? anthropic();
  const first = opts.docs.length ? `${documentsBlock(opts.docs)}\n\n${opts.task}` : opts.task;
  const cached: Anthropic.TextBlockParam[] = opts.docs.length
    ? [
        { type: "text", text: documentsBlock(opts.docs), cache_control: { type: "ephemeral" } },
        { type: "text", text: opts.task },
      ]
    : [{ type: "text", text: opts.task }];
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: opts.cacheDocs ? cached : first },
    ...(opts.followUp ? ([{ role: "assistant", content: opts.followUp.answer }, { role: "user", content: opts.followUp.task }] as Anthropic.MessageParam[]) : []),
  ];
  try {
    const res = await c.messages.parse(
      {
        model: opts.model,
        max_tokens: opts.maxTokens ?? 16000,
        system: [{ type: "text", text: opts.system ?? RESEARCH_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages,
        output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
      },
      opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
    );
    const cost = costMicroUsd(opts.model, res.usage);
    if (res.stop_reason === "refusal") return { data: null, problem: "refusal", costMicroUsd: cost, usage: res.usage };
    if (res.stop_reason === "max_tokens") return { data: null, problem: "max_tokens", costMicroUsd: cost, usage: res.usage };
    if (!res.parsed_output) return { data: null, problem: "unparsed", costMicroUsd: cost, usage: res.usage };
    return { data: res.parsed_output as z.infer<S>, costMicroUsd: cost, usage: res.usage };
  } catch (e) {
    return { data: null, problem: apiProblem(e), costMicroUsd: 0 };
  }
}

/** "api_400: <the API's message>": the status for retry decisions, the message so a rejected request can be diagnosed. */
function apiProblem(e: unknown): string {
  if (!(e instanceof Anthropic.APIError)) return "error";
  const msg = (e.message ?? "").replace(/\s+/g, " ").slice(0, 300);
  return `api_${e.status ?? "error"}${msg ? `: ${msg}` : ""}`;
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
  effort?: Effort;
  claims: Claim[];
  client?: Pick<Anthropic, "messages">;
  /** synthesis: several excerpts per claim, paraphrase and combination allowed (WRITING_PIPELINE_PLAN.md). */
  mode?: "quote" | "synthesis";
}): Promise<{ supported: boolean[]; costMicroUsd: number; problem?: string }> {
  if (!opts.claims.length) return { supported: [], costMicroUsd: 0 };
  const c = opts.client ?? anthropic();
  const synth = opts.mode === "synthesis";
  const list = opts.claims.map((cl, i) => `${i + 1}. Text: ${cl.text}\n   ${synth ? "Excerpts" : "Quote"}: ${cl.quote}`).join("\n");
  try {
    const res = await c.messages.parse({
      model: opts.model,
      max_tokens: 8000,
      system: SUPPORT_SYSTEM,
      messages: [
        {
          role: "user",
          content: synth ? synthSupportTask(list) : supportTask(list),
        },
      ],
      output_config: { effort: opts.effort ?? "low", format: zodOutputFormat(SupportCheck) },
    });
    const cost = costMicroUsd(opts.model, res.usage);
    const out = opts.claims.map(() => false);
    if (res.stop_reason !== "end_turn" || !res.parsed_output) return { supported: out, costMicroUsd: cost, problem: res.stop_reason ?? "unparsed" };
    for (const r of res.parsed_output.results) if (r.n >= 1 && r.n <= out.length) out[r.n - 1] = r.supported;
    return { supported: out, costMicroUsd: cost };
  } catch (e) {
    return { supported: opts.claims.map(() => false), costMicroUsd: 0, problem: apiProblem(e) };
  }
}
