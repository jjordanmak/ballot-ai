import { describe, expect, it } from "vitest";
import type { Race } from "@/data/types";
import { countLine } from "./RaceHeader";

const race = (general: Partial<NonNullable<Race["general"]>> = {}, extra: Partial<Race> = {}) =>
  ({ unopposed: false, navLabel: undefined, general: { sourceDocs: {}, officialSources: [], ...general }, ...extra }) as unknown as Race;

describe("countLine", () => {
  it("puts vote-for next to the number of candidates", () => {
    expect(countLine(race({ voteFor: 1 }), 2)).toBe("Vote for 1 of 2 candidates");
    expect(countLine(race({ voteFor: 3 }), 7)).toBe("Vote for up to 3 of 7 candidates");
    expect(countLine(race({ voteFor: 1, rankedChoice: true }), 5)).toBe("Rank the candidates · 5 candidates");
    expect(countLine(race({ voteFor: 1 }, { unopposed: true }), 1)).toBe("Unopposed");
    expect(countLine(race({}, { navLabel: "Retention · Yes / No" }), 1)).toBe("Retention vote");
  });
});
