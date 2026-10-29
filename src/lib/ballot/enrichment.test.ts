import { describe, expect, it } from "vitest";
import type { ResolvedBallot } from "@/domain/ballot";
import daly from "../../../fixtures/ballots/2026-11-03/daly-city.normalized.json";
import { getEnrichment } from "./enrichment";
import { candidateKey, contestKey, measureKey } from "./enrichmentKeys";
import { toRaces } from "./toRaces";
import { normalizeForMatch, readableName } from "@/domain/text";
import retention from "@/data/official/2026-11-03/ca-judicial-retention.json";

const ballot = daly as unknown as ResolvedBallot;
const bundle = getEnrichment("2026-11-03");

describe("2026-11-03 enrichment ↔ Daly City reference ballot", () => {
  const candidateKeys = new Set(ballot.contests.flatMap((c) => c.choices.map((ch) => candidateKey(c, ch))));
  const contestKeys = new Set(ballot.contests.map((c) => contestKey(c)));
  const measureKeys = new Set(ballot.contests.filter((c) => c.kind === "measure").map((c) => measureKey(c)));

  // Justice names cover every CA retention contest, not just this ballot's.
  const isJustice = (k: string) => /^(supreme court|court of appeal [a-z]+ appellate district)\|/.test(k);

  it("every candidate entry matches a candidate on the ballot", () => {
    expect(Object.keys(bundle.candidates ?? {}).filter((k) => !isJustice(k) && !candidateKeys.has(k))).toEqual([]);
  });
  it("every justice entry matches a certified retention contest, and every one has a name", () => {
    const certified = new Set(
      retention.contests.map((c) => `${normalizeForMatch(c.court)}|${normalizeForMatch(c.office)}::${normalizeForMatch(c.justice)}`),
    );
    const justiceKeys = Object.keys(bundle.candidates ?? {}).filter(isJustice);
    expect(justiceKeys.filter((k) => !certified.has(k))).toEqual([]);
    expect(justiceKeys).toHaveLength(certified.size);
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
  it("no candidate name is shown in all caps", () => {
    const { races } = toRaces(ballot, bundle);
    const caps = races.flatMap((r) => r.candidates.map((c) => c.name)).filter((n) => !/\p{Ll}/u.test(n));
    expect(caps).toEqual([]);
    const evans = races.find((r) => r.candidates[0]?.ballotName === "KELLI M. EVANS")!;
    expect(evans.office).toBe("Associate Justice of the Supreme Court: Kelli M. Evans");
    expect(evans.formatExplainer).toBe(
      "Shall Associate Justice of the Supreme Court Kelli M. Evans be elected to the office for the term provided by law?",
    );
    expect(races.find((r) => r.candidates[0]?.ballotName === "VICTOR A. RODRIGUEZ")!.candidates[0].name).toBe("Victor A. Rodríguez");
  });
  it("groups races by jurisdiction and lists statewide measures first", () => {
    const { races, measures } = toRaces(ballot, bundle);
    const groups = races.map((r) => r.group).filter((g, i, a) => g !== a[i - 1]);
    expect(groups).toEqual(["Federal", "Statewide", "State Legislature", "Judicial", "County", "City / Municipal", "Education"]);
    expect(measures.map((m) => m.statewide)).toEqual([...Array(14).fill(true), ...Array(7).fill(false)]);
  });
});

describe("readableName", () => {
  it.each([
    ["DONALD P. (DON) WAGNER", "Donald P. (Don) Wagner"],
    ["ROD DAUS-MAGBUAL", "Rod Daus-Magbual"],
    ["TERESA PROAÑO", "Teresa Proaño"],
    ["JOHN O'BRIEN JR.", "John O'Brien Jr."],
    ["MARY MCDONALD III", "Mary McDonald III"],
    ["Pamela DiGiovanni", "Pamela DiGiovanni"],
  ])("%s → %s", (raw, out) => expect(readableName(raw)).toBe(out));
});
