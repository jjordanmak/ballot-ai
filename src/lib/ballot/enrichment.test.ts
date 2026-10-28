import { describe, expect, it } from "vitest";
import type { ResolvedBallot } from "@/domain/ballot";
import daly from "../../../fixtures/ballots/2026-11-03/daly-city.normalized.json";
import { getEnrichment } from "./enrichment";
import { candidateKey, contestKey, measureKey } from "./enrichmentKeys";
import { toRaces } from "./toRaces";

const ballot = daly as unknown as ResolvedBallot;
const bundle = getEnrichment("2026-11-03");

describe("2026-11-03 enrichment ↔ Daly City reference ballot", () => {
  const candidateKeys = new Set(ballot.contests.flatMap((c) => c.choices.map((ch) => candidateKey(c, ch))));
  const contestKeys = new Set(ballot.contests.map((c) => contestKey(c)));
  const measureKeys = new Set(ballot.contests.filter((c) => c.kind === "measure").map((c) => measureKey(c)));

  it("every candidate entry matches a candidate on the ballot", () => {
    expect(Object.keys(bundle.candidates ?? {}).filter((k) => !candidateKeys.has(k))).toEqual([]);
  });
  it("every contest entry matches a contest on the ballot", () => {
    expect(Object.keys(bundle.contests ?? {}).filter((k) => !contestKeys.has(k))).toEqual([]);
  });
  it("every statewide proposition on the ballot has official content", () => {
    const props = [...measureKeys].filter((k) => k.startsWith("california|proposition"));
    expect(props).toHaveLength(14);
    expect(props.filter((k) => !bundle.measures?.[k])).toEqual([]);
  });
  it("every cited source id resolves", () => {
    const json = JSON.stringify([bundle.candidates, bundle.contests, bundle.measures]);
    const ids = [...json.matchAll(/"sources":\[([^\]]*)\]/g)].flatMap((m) => m[1].split(",").map((s) => s.replace(/"/g, "")).filter(Boolean));
    expect(ids.filter((id) => !bundle.sources[id])).toEqual([]);
  });
  it("adapter applies official names and keeps the ballot name", () => {
    const { races } = toRaces(ballot, bundle);
    const gov = races.find((r) => r.office === "Governor")!;
    expect(gov.candidates.map((c) => c.name)).toEqual(["Xavier Becerra", "Steve Hilton"]);
    expect(gov.candidates[0].ballotName).toBe("XAVIER BECERRA");
    expect(gov.candidates[0].general?.ballotDesignation?.text).toBe("Voting Rights Attorney");
  });
});
