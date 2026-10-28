/**
 * Status + freshness rules shared by the Civic resolver and the fixture
 * resolver. Pure (no server-only), so tests and scripts can import it.
 */
import type { BallotWarning, ResolutionStatus } from "@/domain/ballot";

const HOUR = 3600;
/** Defaults/caps for the address-free resolution cache. See PRIVACY.md §5. */
export const CACHE_DEFAULT_S = 6 * HOUR;
export const CACHE_MAX_S = 24 * HOUR;
export const CACHE_MIN_S = 30 * 60;

export function clampTtl(maxAge: number | undefined): number {
  if (maxAge === undefined) return CACHE_DEFAULT_S;
  return Math.min(CACHE_MAX_S, Math.max(CACHE_MIN_S, maxAge));
}

/** A provider answer with zero contests is "no coverage", never "empty ballot". */
export function decideStatus(contestCount: number, warnings: BallotWarning[]): ResolutionStatus {
  if (warnings.some((w) => w.code === "ELECTION_DATE_MISMATCH")) return "ELECTION_NOT_FOUND";
  if (contestCount === 0) return "NO_COVERAGE";
  const partial = warnings.some(
    (w) =>
      w.severity === "error" ||
      w.code === "CONTEST_WITHOUT_CHOICES" ||
      w.code === "MISSING_JURISDICTION" ||
      w.code === "MEASURE_WITHOUT_TITLE",
  );
  return partial ? "PARTIAL" : "SUCCESS";
}
