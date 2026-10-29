import { describe, expect, it } from "vitest";
import compareSet from "@/data/research/compare-set.json";
import { DEFAULT_COMPARE, type Setting } from "@/lib/ai/config";
import { buildComparison, coordinates, settingLabel, type CellInput, type CompareTarget } from "./compareReview";

const src = { url: "https://voterguide.sos.ca.gov/propositions/1/", title: "Prop 1", publisher: "California Secretary of State", official: true, fetchedAt: "2026-10-29T08:00:00Z" };
const target: CompareTarget = { key: "measure:m1:measure", kind: "measure", label: "Proposition 1", group: "Measures" };
const settings: Setting[] = [
  { model: "claude-haiku-5-5", effort: "low" },
  { model: "claude-sonnet-5-5", effort: "medium" },
  { model: "claude-opus-5-5", effort: "high" },
];
const measure = (summary: string) => ({ kind: "measure" as const, answers: { summary: { text: summary, quote: "q", source: "s1" } }, sources: { s1: src } });

describe("buildComparison", () => {
  it("lines up every setting for an item, flags differing fields, and sums each setting", () => {
    const cells = new Map<string, CellInput>([
      ["measure:m1:measure@claude-haiku-5-5:low", { stateKey: "", payload: measure("Borrows <mark>$10 billion</mark> for schools."), run: { costMicroUsd: 3000, seconds: 4, rejected: [{ field: "taxes", reason: "quote not found" }], usage: { input_tokens: 3000, cache_read_input_tokens: 1000 } } }],
      ["measure:m1:measure@claude-sonnet-5-5:medium", { stateKey: "", payload: measure("Borrows $10 billion for schools"), run: { costMicroUsd: 90_000, seconds: 12 } }],
      ["measure:m1:measure@claude-opus-5-5:high", { stateKey: "", outcome: "no documents" }],
    ]);
    const { items, summary } = buildComparison([target], settings, cells);
    const [item] = items;
    expect(item.cells.map((c) => c.status)).toEqual(["done", "done", "no documents"]);
    // Same words, different marks and punctuation: not a difference.
    expect(item.differing).toEqual([]);
    expect(item.cells[0].fields.summary[0]).toMatchObject({ refs: [{ quote: "q", source: src }] });
    expect(item.cells[0].rejected).toEqual([{ field: "taxes", reason: "quote not found" }]);
    expect(summary[0]).toMatchObject({ setting: "claude-haiku-5-5:low", done: 1, costMicroUsd: 3000, avgSeconds: 4, kept: 1, blank: 8, rejectedByReason: { "quote not found": 1 }, cachedShare: 0.25 });
    expect(summary[2]).toMatchObject({ done: 0, costMicroUsd: 0, avgSeconds: null, cachedShare: null });
  });

  it("flags a field the settings answer differently", () => {
    const cells = new Map<string, CellInput>([
      ["measure:m1:measure@claude-haiku-5-5:low", { stateKey: "", payload: measure("Borrows $10 billion.") }],
      ["measure:m1:measure@claude-sonnet-5-5:medium", { stateKey: "", payload: measure("Borrows $12 billion.") }],
    ]);
    expect(buildComparison([target], settings, cells).items[0].differing).toEqual(["summary"]);
  });

  it("shows a person as the ballot would: bio, current role, education, positions with committees, and what was left out", () => {
    const person: CompareTarget = { key: "candidate:k1:profile", kind: "candidate", label: "Ann Bee", group: "Candidates" };
    const payload = {
      kind: "person" as const,
      v: 2 as const,
      education: [{ degree: "Juris Doctor", institution: "Stanford Law School", quote: "qe", source: "s1" }],
      positions: [{ title: "State Senator", organization: "California State Senate", startYear: 2020, endYear: "present" as const, type: "elected" as const, committees: ["Budget"], quote: "qp", source: "s1" }],
      platform: [{ text: "Says she will expand transit.", quote: "ql", source: "s1" }],
      bio: [{ text: "Ann Bee is a State Senator.", facts: ["P0"] }],
      sources: { s1: src },
    };
    const cells = new Map<string, CellInput>([["candidate:k1:profile@claude-haiku-5-5:low", { stateKey: "", payload, run: { leftOut: [{ fact: "Son of teachers", reason: "family background" }] } }]]);
    const cell = buildComparison([person], settings, cells).items[0].cells[0];
    expect(cell.fields.bio).toEqual([{ text: "Ann Bee is a State Senator.", refs: [{ quote: "qp", source: src }] }]);
    expect(cell.fields.currentRole[0].text).toBe("State Senator, California State Senate");
    expect(cell.fields.education[0].text).toBe("J.D., Stanford Law School");
    expect(cell.fields.pastPositions[0]).toMatchObject({ text: "State Senator, California State Senate · 2020–present", sub: "Committees: Budget" });
    expect(cell.leftOut).toEqual([{ fact: "Son of teachers", reason: "family background" }]);
  });

  it("a cell with nothing yet is pending", () => {
    expect(buildComparison([target], settings, new Map()).items[0].cells.every((c) => c.status === "pending")).toBe(true);
  });
});

describe("the comparison set", () => {
  it("has ~30 items across every kind, no address, and coordinates for each", () => {
    const ts = compareSet.targets as CompareTarget[];
    expect(ts.length).toBeGreaterThanOrEqual(28);
    expect(new Set(ts.map((t) => t.kind))).toEqual(new Set(["measure", "retention", "candidate", "office"]));
    expect(new Set(ts.map((t) => t.key)).size).toBe(ts.length);
    expect(JSON.stringify(compareSet)).not.toMatch(/\b\d+\s+[A-Z][a-z]+\s+(Drive|Dr|Street|St|Avenue|Ave|Road|Rd|Way)\b/);
    for (const t of ts) {
      const c = coordinates(t.key);
      expect(["measure", "candidate", "contest"]).toContain(c.targetType);
      expect(["measure", "profile", "office"]).toContain(c.field);
      expect(c.targetId.length).toBeGreaterThan(0);
    }
    expect(coordinates("contest:ca|governor|california:office")).toEqual({ targetType: "contest", targetId: "ca|governor|california", field: "office" });
  });

  it("labels the 9 columns", () => {
    expect(DEFAULT_COMPARE.map((s) => settingLabel(`${s.model}:${s.effort}`))).toEqual([
      "Haiku · low", "Haiku · medium", "Haiku · high", "Sonnet · low", "Sonnet · medium", "Sonnet · high", "Opus · low", "Opus · medium", "Opus · high",
    ]);
  });
});
