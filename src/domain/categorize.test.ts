import { describe, expect, it } from "vitest";
import { categorizeContest } from "./categorize";

const cat = (title: string, extra: Partial<Parameters<typeof categorizeContest>[0]> = {}) =>
  categorizeContest({ kind: "candidate", title, districtName: "Franklin County", ...extra });

describe("categorizeContest beyond California", () => {
  it("files other states' statewide offices as statewide even when the district is a county", () => {
    for (const t of [
      "Governor and Lieutenant Governor",
      "Chief Financial Officer",
      "Commissioner of Agriculture and Consumer Services",
      "Auditor of State",
      "Treasurer of State",
      "Comptroller of Public Accounts",
      "Commissioner of the General Land Office",
      "Commissioner of Public Lands",
      "State Mine Inspector",
      "Secretary of the Commonwealth",
      "State Superintendent of Schools",
    ]) {
      expect(cat(t), t).toBe("statewide");
    }
  });
  it("recognizes state legislature titles across states, but not local assemblies", () => {
    for (const t of ["Representative in the General Assembly", "Senator in the General Assembly", "Representative in General Court", "Member of the General Assembly", "Member of Assembly", "Member of the Legislature"]) {
      expect(cat(t), t).toBe("state_legislature");
    }
    expect(cat("Borough Assembly Member", { districtName: "Kenai Peninsula Borough" })).toBe("county");
  });
  it("handles court clerks, unified governments, parishes and DC", () => {
    expect(cat("Clerk of the Circuit Court")).toBe("county");
    expect(cat("Unified Government Commissioner", { scope: "countywide" })).toBe("county");
    expect(cat("Assessor", { districtName: "Orleans Parish" })).toBe("county");
    expect(cat("Delegate to the U.S. House of Representatives")).toBe("federal");
  });
});
