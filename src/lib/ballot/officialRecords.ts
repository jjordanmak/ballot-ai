/**
 * Official-records supplement: contests the state election authority has
 * certified for this voter's geography that the ballot provider omitted
 * (e.g. Google Civic returned no judicial retention contests for the
 * 2026-11-03 California ballot). Higher-priority official data fills the
 * gap; it never overrides or removes provider contests. Each addition is
 * cited and flagged with a PROVIDER_GAP warning. See SOURCE_STRATEGY.md §2.
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
      if (r.appliesTo.counties) {
        if (!county) {
          ballot.warnings.push({ code: "PROVIDER_GAP", severity: "warn", detail: `county unknown; cannot place ${r.court} retention contests` });
          continue;
        }
        if (!r.appliesTo.counties.some((c) => normalizeForMatch(c) === normalizeForMatch(county))) continue;
      }
      if (alreadyPresent(ballot.contests, r.justice)) continue;
      added.push(toContest(r, ballot.election!.id, source, file.source.publisher));
    }
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

function alreadyPresent(contests: Contest[], justice: string): boolean {
  const key = normalizeForMatch(justice);
  return contests.some((c) => c.category === "judicial" && c.choices.some((ch) => normalizeForMatch(ch.ballotName) === key));
}

function toContest(r: RetentionRecord, electionId: string, source: SourceRef, publisher: string): Contest {
  const id = stableId("ct", electionId, "official-retention", r.office, r.justice!);
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
