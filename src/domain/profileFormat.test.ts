import { describe, expect, it } from "vitest";
import { degreeLabel, educationLine, positionLine, positionYears, sortPositions } from "./profileFormat";

describe("profile formatting", () => {
  it("writes degrees one way", () => {
    expect(["Juris Doctor", "JD", "J.D.", "Juris Doctor degree", "a Juris Doctorate"].map(degreeLabel)).toEqual(["J.D.", "J.D.", "J.D.", "J.D.", "J.D."]);
    expect(degreeLabel("Bachelor of Arts")).toBe("B.A.");
    expect(degreeLabel("Certificate in Public Policy")).toBe("Certificate in Public Policy");
    expect(educationLine({ degree: "MBA", institution: "Wharton School", year: 2004 })).toBe("M.B.A., Wharton School · 2004");
  });

  it("writes years one way", () => {
    expect(positionYears({ startYear: 1987, endYear: 1990 })).toBe("1987–1990");
    expect(positionYears({ startYear: 2019, endYear: "present" })).toBe("2019–present");
    expect(positionYears({ startYear: 1992 })).toBe("from 1992");
    expect(positionYears({ endYear: 1990 })).toBe("until 1990");
    expect(positionYears({ startYear: 2010, endYear: 2010 })).toBe("2010");
  });

  it("doesn't repeat the organization or district already in the title", () => {
    expect(positionLine({ title: "Member, California State Assembly", organization: "California State Assembly", district: "59th District" })).toBe("Member, California State Assembly (59th District)");
  });

  it("orders newest first, current roles on top, undated last", () => {
    const list = sortPositions([
      { title: "A", startYear: 1987, endYear: 1990 as const },
      { title: "B" },
      { title: "C", startYear: 2021, endYear: "present" as const },
      { title: "D", startYear: 1990, endYear: 1992 as const },
    ]);
    expect(list.map((p) => p.title)).toEqual(["C", "D", "A", "B"]);
  });
});
