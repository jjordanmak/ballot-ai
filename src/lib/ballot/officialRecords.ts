/**
 * Official-records supplement: contests the state election authority has
 * certified for this voter's geography that the ballot provider omitted
 * (e.g. Google Civic returned no judicial retention contests for the
 * 2026-11-03 California ballot). Higher-priority official data fills the
 * gap. Each addition is cited and flagged with a PROVIDER_GAP warning. See
 * SOURCE_STRATEGY.md §2.
 *
 * When the provider does list a judge's retention contest (some counties
 * send them as referendums, under the county's name), that is the same
 * contest: the certified record replaces it in place, so every ballot shares
 * one contest per judge with the official wording, court and source. The
 * provider listing the judge also places a county-scoped record when the
 * provider gave no county. Nothing else is overridden or removed.
 */
import type { CandidateChoice, Contest, ResolvedBallot, SourceRef } from "@/domain/ballot";
import { stableId } from "@/domain/ids";
import { normalizeForMatch } from "@/domain/text";
import caRetention2026 from "@/data/official/2026-11-03/ca-judicial-retention.json";

interface RetentionRecord {
  court: string;
  office: string;
  question: string;
  justice: string | null;
  appliesTo: { state: string; counties?: string[] };
}
interface RetentionFile {
  election: string;
  source: { id: string; title: string; publisher: string; url: string; official: boolean; accessed: string };
  contests: RetentionRecord[];
}

const FILES: Record<string, RetentionFile[]> = {
  "2026-11-03": [caRetention2026 as RetentionFile],
};

export function supplementWithOfficialRecords(ballot: ResolvedBallot): ResolvedBallot {
  const slug = ballot.election?.slug;
  const state = ballot.location.state;
  // Never mix real official records into fictional fixture ballots.
  if (!slug || !state || ballot.provider === "fixture") return ballot;
  const county = ballot.location.county?.replace(/\s+county$/i, "").trim();

  const added: Contest[] = [];
  let upgraded = 0;
  const unplaced = new Set<string>();
  for (const file of FILES[slug] ?? []) {
    const source: SourceRef = {
      provider: "durable",
      name: `${file.source.publisher} (certified list of candidates)`,
      url: file.source.url,
      official: true,
      retrievedAt: `${file.source.accessed}T00:00:00.000Z`,
      verifiedAt: `${file.source.accessed}T00:00:00.000Z`,
    };
    for (const r of file.contests) {
      if (r.appliesTo.state !== state || !r.justice) continue;
      const at = providerIndex(ballot.contests, r.justice);
      if (at >= 0) {
        ballot.contests[at] = toContest(r, ballot.election!.id, source, file.source.publisher);
        upgraded++;
        continue;
      }
      if (ballot.contests.some((c) => c.id === toContestId(r, ballot.election!.id))) continue;
      if (r.appliesTo.counties) {
        if (!county) {
          unplaced.add(r.court);
          continue;
        }
        if (!r.appliesTo.counties.some((c) => normalizeForMatch(c) === normalizeForMatch(county))) continue;
      }
      added.push(toContest(r, ballot.election!.id, source, file.source.publisher));
    }
  }
  // Courts the provider listed no judge for and whose counties can't be checked.
  for (const court of unplaced) {
    if (!ballot.contests.some((c) => c.division.key.endsWith(`:court:${normalizeForMatch(court)}`))) {
      ballot.warnings.push({ code: "PROVIDER_GAP", severity: "warn", detail: `county unknown; cannot place ${court} retention contests` });
    }
  }
  if (upgraded) {
    ballot.warnings.push({ code: "PROVIDER_GAP", severity: "info", detail: `${upgraded} judicial retention contest(s) replaced with the certified list of candidates` });
  }
  if (!added.length) return ballot;

  ballot.warnings.push({
    code: "PROVIDER_GAP",
    severity: "info",
    detail: `${added.length} judicial retention contest(s) added from the certified list of candidates`,
  });
  // Place judicial contests after the statewide block, as on the printed ballot.
  const lastStatewide = ballot.contests.map((c) => c.category).lastIndexOf("statewide");
  const at = lastStatewide >= 0 ? lastStatewide + 1 : ballot.contests.findIndex((c) => c.kind === "measure");
  const insertAt = at < 0 ? ballot.contests.length : at;
  ballot.contests = [...ballot.contests.slice(0, insertAt), ...added, ...ballot.contests.slice(insertAt)];
  return ballot;
}

/** The provider's own contest for this judge (not one added from official records), or -1. */
function providerIndex(contests: Contest[], justice: string): number {
  const key = normalizeForMatch(justice);
  return contests.findIndex(
    (c) => c.category === "judicial" && c.verification?.status !== "verified" && c.choices.some((ch) => normalizeForMatch(ch.ballotName) === key),
  );
}

function toContestId(r: RetentionRecord, electionId: string): string {
  return stableId("ct", electionId, "official-retention", r.office, r.justice!);
}

function toContest(r: RetentionRecord, electionId: string, source: SourceRef, publisher: string): Contest {
  const id = toContestId(r, electionId);
  const choice: CandidateChoice = {
    id: stableId("cd", id, r.justice!),
    ballotName: r.justice!,
    urls: { channels: [] },
    sources: [source],
  };
  return {
    id,
    kind: "candidate",
    contestType: "retention",
    rawType: "Retention",
    title: r.office,
    ballotTitle: r.question,
    division: { key: `${r.appliesTo.state.toLowerCase()}:court:${normalizeForMatch(r.court)}`, name: r.court, scope: "judicial" },
    category: "judicial",
    voteFor: 1,
    special: false,
    roles: ["judge"],
    levels: [],
    choices: [choice],
    sources: [source],
    verification: { status: "verified", source, note: `Certified by the ${publisher}` },
  };
}
