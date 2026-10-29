import { describe, expect, it } from "vitest";
import type { Contest } from "./ballot";
import { districtsFrom } from "./districts";

const c = (title: string, category?: string, division: { scope?: string; name?: string } = {}) =>
  ({ title, category, division: { key: "", name: "", ...division } }) as unknown as Contest;
const show = (ds: ReturnType<typeof districtsFrom>) => ds.map((d) => `${d.kind}:${d.number}`);

describe("districtsFrom across states", () => {
  it("never reads a state representative as a congressional seat", () => {
    expect(show(districtsFrom([], [c("State Representative, District 12", "state_legislature")], "TX"))).toEqual(["state_lower:12"]);
  });
  it("marks at-large congressional seats", () => {
    expect(show(districtsFrom([], [c("U.S. Representative", "federal"), c("State Representative, District 12")], "WY"))).toEqual([
      "congressional:AL",
      "state_lower:12",
    ]);
  });
  it("reads Pennsylvania, Maryland and Nebraska titles", () => {
    expect(show(districtsFrom([], [c("Representative in the General Assembly", "state_legislature", { name: "181st Legislative District" })], "PA"))).toEqual([
      "state_lower:181",
    ]);
    expect(show(districtsFrom([], [c("House of Delegates, District 4A", "state_legislature")], "MD"))).toEqual(["state_lower:4A"]);
    expect(show(districtsFrom([], [c("Member of the Legislature, District 10", "state_legislature", { scope: "stateUpper" })], "NE"))).toEqual([
      "state_upper:10",
    ]);
  });
  it("prefers the district on the ballot over division ids, and fills the rest from ids", () => {
    const ids = ["ocd-division/country:us/state:tx/cd:7", "ocd-division/country:us/state:tx/sldu:15"];
    expect(show(districtsFrom(ids, [c("U.S. Representative, District 9", "federal")], "TX"))).toEqual(["congressional:9", "state_upper:15"]);
  });
  it("ignores borough and municipal assemblies", () => {
    expect(districtsFrom([], [c("Borough Assembly Member, Seat B", "county")], "AK")).toEqual([]);
  });
});
