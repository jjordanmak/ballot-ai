import { describe, expect, it } from "vitest";
import type { Contest } from "@/domain/ballot";
import { divisionState, durableTitles } from "./durable";

const contest = (title: string, names: string[], key = "fl:judicial::supreme court", contestType = "general"): Contest =>
  ({ title, contestType, division: { key, name: "" }, choices: names.map((n) => ({ ballotName: n })) }) as unknown as Contest;

describe("durableTitles", () => {
  it("tells apart contests that share a division and title by their candidates", () => {
    const a = contest("Supreme Court Justice", ["Jamie Grosshans"]);
    const b = contest("Supreme Court Justice", ["Renatha Francis"]);
    const c = contest("Governor", ["X", "Y"], "ocd-division/country:us/state:fl");
    const t = durableTitles([a, b, c]);
    expect(new Set([t.get(a), t.get(b)]).size).toBe(2);
    expect(t.get(c)).toBe("governor");
  });
  it("keeps the justice's name on retention titles", () => {
    expect(durableTitles([contest("Associate Justice", ["Ann Lee"], "ca:court:supreme court", "retention")]).values().next().value).toBe(
      "associate justice ann lee",
    );
  });
});

describe("divisionState", () => {
  it("reads the state from OCD ids and state-prefixed keys", () => {
    expect(divisionState("ocd-division/country:us/state:oh/cd:9", "CA")).toBe("OH");
    expect(divisionState("ocd-division/country:us/district:dc", undefined)).toBe("DC");
    expect(divisionState("ocd-division/country:us", "CA")).toBeNull();
    expect(divisionState("tx:statelower:12:state house district 12", "CA")).toBe("TX");
  });
});
