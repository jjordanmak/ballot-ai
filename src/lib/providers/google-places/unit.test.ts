import { describe, expect, it } from "vitest";
import { extractUnit, withUnit } from "./unit";

describe("extractUnit", () => {
  it.each([
    ["123 Main St Apt 4", "Apt 4"],
    ["123 Main St, Apt. 4B, Daly City", "Apt. 4B"],
    ["123 Main St Unit B", "Unit B"],
    ["123 Main St #12", "#12"],
    ["123 Main St # 12", "# 12"],
    ["500 Market St Suite 200", "Suite 200"],
    ["123 Main St Ste 3-A", "Ste 3-A"],
    ["123 Main St", undefined],
    ["123 Unity Ave", undefined],
    ["123 Main St, Miami, FL 33101", undefined],
    ["123 Aptos Ave", undefined],
  ])("%j → %j", (typed, unit) => expect(extractUnit(typed)).toBe(unit));
});

describe("withUnit", () => {
  const addr = "123 Main St, Daly City, CA 94015, USA";
  it("adds the typed unit after the street line", () => {
    expect(withUnit(addr, "Apt 4")).toBe("123 Main St Apt 4, Daly City, CA 94015, USA");
    expect(withUnit(addr, "#12")).toBe("123 Main St #12, Daly City, CA 94015, USA");
  });
  it("leaves the address alone without a unit, or when Google already has it", () => {
    expect(withUnit(addr, undefined)).toBe(addr);
    expect(withUnit("123 Main St #4, Daly City, CA 94015, USA", "Apt 4")).toBe("123 Main St #4, Daly City, CA 94015, USA");
    expect(withUnit("123 Main St Apt 4, Daly City, CA 94015, USA", "Apt 4")).toBe("123 Main St Apt 4, Daly City, CA 94015, USA");
    expect(withUnit("123 Main St #3-A, Daly City, CA 94015, USA", "Ste 3-A")).toBe("123 Main St #3-A, Daly City, CA 94015, USA");
  });
});
