/**
 * Provider-agnostic ballot validators. Normalizers emit warnings while
 * parsing; these run afterwards on any ResolvedBallot (live, fixture, or
 * durable) so QA scripts and CI apply one rule set.
 * See docs/architecture/PROVIDER_ARCHITECTURE.md §5.
 */
import type { BallotWarning, ResolvedBallot } from "@/domain/ballot";
import { hasBallot } from "@/domain/ballot";
import { normalizeForMatch } from "@/domain/text";

export function validateBallot(b: ResolvedBallot, today: string): BallotWarning[] {
  const out: BallotWarning[] = [];
  if (!hasBallot(b)) return out;

  if (b.contests.length === 0) out.push({ code: "ZERO_CONTESTS", severity: "error" });
  if (b.election && b.election.date < today) {
    out.push({ code: "STALE_ELECTION", severity: "warn", detail: `election ${b.election.date} is past` });
  }

  const ids = new Set<string>();
  for (const c of b.contests) {
    if (ids.has(c.id)) out.push({ code: "DUPLICATE_CONTEST", severity: "error", contestId: c.id });
    ids.add(c.id);

    if (!c.division.name) out.push({ code: "MISSING_JURISDICTION", severity: "warn", contestId: c.id });
    if (!c.sources.some((s) => s.official)) {
      out.push({ code: "MISSING_SOURCE", severity: "info", contestId: c.id, detail: "no official source" });
    }

    if (c.kind === "measure") {
      if (!c.measure?.title && !c.measure?.identifier) {
        out.push({ code: "MEASURE_WITHOUT_TITLE", severity: "warn", contestId: c.id });
      }
      continue;
    }

    if (c.choices.length === 0) out.push({ code: "CONTEST_WITHOUT_CHOICES", severity: "warn", contestId: c.id });
    const names = new Set<string>();
    for (const ch of c.choices) {
      const k = normalizeForMatch(ch.ballotName);
      if (names.has(k)) out.push({ code: "DUPLICATE_CANDIDATE", severity: "error", contestId: c.id, detail: ch.ballotName });
      names.add(k);
    }
    if (c.voteFor !== undefined && c.numberElected !== undefined && c.voteFor > c.numberElected) {
      out.push({
        code: "NUMBER_PARSE",
        severity: "warn",
        contestId: c.id,
        detail: `voteFor ${c.voteFor} > numberElected ${c.numberElected}`,
      });
    }
    if (c.contestType === "other") {
      out.push({ code: "UNSUPPORTED_CONTEST_TYPE", severity: "info", contestId: c.id, detail: c.rawType });
    }
  }
  return out;
}

/** Summary counts for reports. */
export function summarize(warnings: BallotWarning[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of warnings) counts[w.code] = (counts[w.code] ?? 0) + 1;
  return counts;
}
