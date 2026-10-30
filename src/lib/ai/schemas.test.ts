import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MeasureSynthesis, NeutralityReview, OfficeResearch, PersonFacts, PersonLists, PersonWriting, RaceSynthesis, Rewrite, SupportCheck } from "./schemas";

const size = (s: Parameters<typeof zodOutputFormat>[0]) => JSON.stringify((zodOutputFormat(s) as unknown as { schema: unknown }).schema).length;

describe("output schemas", () => {
  // The combined person schema (lists + writing, ~5.7K chars) was rejected by the API in round 1 (2026-10-30).
  // PersonFacts (~4.2K) compiled in production, so nothing we send may be larger than it.
  it("each stays within the size known to compile", () => {
    const limit = size(PersonFacts);
    for (const [name, s] of Object.entries({ PersonLists, PersonWriting, MeasureSynthesis, RaceSynthesis, Rewrite, NeutralityReview, SupportCheck, OfficeResearch })) {
      expect(size(s), name).toBeLessThanOrEqual(limit);
    }
  });
});
