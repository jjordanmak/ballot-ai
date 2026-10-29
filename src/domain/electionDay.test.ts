import { describe, expect, it } from "vitest";
import { electionToday } from "./electionDay";

describe("electionToday", () => {
  it("keeps election day current until midnight in Hawaii", () => {
    expect(electionToday(new Date("2026-11-04T02:00:00Z"))).toBe("2026-11-03"); // 6 pm PT, polls open in the West
    expect(electionToday(new Date("2026-11-04T09:59:00Z"))).toBe("2026-11-03"); // 11:59 pm HST
    expect(electionToday(new Date("2026-11-04T10:00:00Z"))).toBe("2026-11-04");
  });
});
