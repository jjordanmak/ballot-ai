import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildComparison, type CellInput, type CompareTarget } from "@/lib/research/compareReview";
import { DEFAULT_COMPARE } from "@/lib/ai/config";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({}) }));

const src = { url: "https://voterguide.sos.ca.gov/propositions/1/", title: "Prop 1", publisher: "California Secretary of State", official: true, fetchedAt: "2026-10-29T08:00:00Z" };
const targets: CompareTarget[] = [
  { key: "measure:m1:measure", kind: "measure", label: "Proposition 1 (statewide bond)", group: "Measures" },
  { key: "contest:ca|governor|california:office", kind: "office", label: "Governor", group: "Offices" },
];
const cells = new Map<string, CellInput>([
  [
    "measure:m1:measure@claude-haiku-5-5:low",
    {
      stateKey: "",
      payload: { kind: "measure", answers: { summary: { text: "Borrows <mark>$10 billion</mark> for school buildings.", quote: "This act provides $10 billion", source: "s1" } }, sources: { s1: src } },
      run: { costMicroUsd: 3100, seconds: 4.2, rejected: [{ field: "taxes", reason: "quote not found" }] },
    },
  ],
  ["measure:m1:measure@claude-opus-5-5:high", { stateKey: "", payload: { kind: "measure", answers: { summary: { text: "Borrows $12 billion.", quote: "q", source: "s1" } }, sources: { s1: src } }, run: { costMicroUsd: 210_000, seconds: 31 } }],
  ["contest:ca|governor|california:office@claude-haiku-5-5:low", { stateKey: "", outcome: "no documents" }],
]);

vi.mock("@/lib/research/compareLoad", () => ({
  loadComparison: async () => ({ ballot: "Daly City (94015) sample ballot", settings: DEFAULT_COMPARE, ...buildComparison(targets, DEFAULT_COMPARE, cells), failures: [] }),
}));

import ComparePage from "./page";

const render = async (searchParams: Record<string, string> = {}) => renderToString(await ComparePage({ searchParams: Promise.resolve(searchParams) }));

describe("/internal/compare", () => {
  it("shows every setting side by side with quotes, sources, rejections, cost and time", async () => {
    const html = await render();
    for (const label of ["Haiku · low", "Sonnet · medium", "Opus · high"]) expect(html).toContain(label);
    expect(html).toContain("Proposition 1 (statewide bond)");
    expect(html).toContain("<mark>$10 billion</mark>");
    expect(html).toContain("This act provides $10 billion");
    expect(html).toContain("Official · California Secretary of State");
    expect(html).toContain("Rejected (quote not found)");
    expect(html).toContain("No documents found");
    expect(html).toContain("Settings differ on: What it does");
    expect(html).not.toMatch(/\b\d+\s+[A-Z][a-z]+\s+(Drive|Dr|Street|St|Avenue|Ave|Road|Rd|Way)\b/);
  });

  it("filters by item type, by difference, and hides columns", async () => {
    expect(await render({ kind: "office" })).not.toContain("Proposition 1 (statewide bond)</h2>");
    const differ = await render({ differ: "1" });
    expect(differ).toContain("Proposition 1 (statewide bond)</h2>");
    expect(differ).not.toContain("Governor</h2>");
    const hidden = await render({ hide: "claude-haiku-5-5:low" });
    expect(hidden).not.toContain("This act provides $10 billion");
  });

  it("404s in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(render()).rejects.toThrow();
    vi.unstubAllEnvs();
  });
});
