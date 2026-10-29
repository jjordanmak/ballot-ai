import { describe, expect, it } from "vitest";
import type { MeasureResearch } from "@/lib/ai/schemas";
import { buildPayload, payloadIsEmpty, screenMeasure, type FetchedDoc } from "./verify";

const docs: FetchedDoc[] = [
  {
    id: "D1",
    sourceId: "uuid-1",
    text: "Under current law, the state charges a 6% tax on sales. This measure raises the tax to 7.25% and sends the money to road repair.",
    meta: { url: "https://voterguide.example.gov/analysis", title: "Analysis", publisher: "Secretary of State", official: true, fetchedAt: "2026-10-29T00:00:00Z" },
  },
];

const empty: MeasureResearch = { summary: null, yesMeans: null, noMeans: null, taxes: null, cost: null, money: null, affected: null, currentLaw: null, kind: null };

describe("screenMeasure", () => {
  it("keeps answers whose quote is in the cited document", () => {
    const { pending, rejected } = screenMeasure(
      { ...empty, currentLaw: { text: "The state sales tax is <mark>6%</mark>.", quote: "the state charges a 6% tax on sales", sourceId: "D1" } },
      docs,
    );
    expect(rejected).toEqual([]);
    expect(pending).toEqual([{ field: "currentLaw", text: "The state sales tax is <mark>6%</mark>.", quote: "the state charges a 6% tax on sales", source: "uuid-1" }]);
  });

  it("drops invented quotes, unknown documents and judgmental wording", () => {
    const { pending, rejected } = screenMeasure(
      {
        ...empty,
        taxes: { text: "Raises the tax to 9%.", quote: "raises the tax to 9%", sourceId: "D1" },
        money: { text: "Road repair.", quote: "sends the money to road repair", sourceId: "D7" },
        summary: { text: "A bold plan to fix roads.", quote: "sends the money to road repair", sourceId: "D1" },
      },
      docs,
    );
    expect(pending).toEqual([]);
    expect(rejected.map((r) => r.reason).sort()).toEqual(["neutrality", "quote not found", "unknown source"]);
  });
});

describe("buildPayload", () => {
  it("publishes only claims the support check confirmed, citing only the documents used", () => {
    const { pending } = screenMeasure(
      {
        ...empty,
        currentLaw: { text: "The state sales tax is 6%.", quote: "the state charges a 6% tax on sales", sourceId: "D1" },
        taxes: { text: "Raises the sales tax to 7.25%.", quote: "This measure raises the tax to 7.25%", sourceId: "D1" },
      },
      docs,
    );
    const { payload, rejected, sourceIds } = buildPayload("measure", pending, [true, false], docs);
    expect(payload.kind === "measure" && Object.keys(payload.answers)).toEqual(["taxes"]);
    expect(rejected).toEqual([{ field: "currentLaw", reason: "unsupported" }]);
    expect(sourceIds).toEqual(["uuid-1"]);
    expect(payloadIsEmpty(payload)).toBe(false);
  });
});
