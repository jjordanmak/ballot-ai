/**
 * Address-free geography key. See docs/architecture/PRIVACY.md §3.
 *
 * Derived from the election and the set of electoral districts on the
 * ballot — shared by every household with that ballot — never from the
 * address string or precinct.
 */
import { createHash } from "node:crypto";

export function computeBallotKey(electionId: string, districtDescriptors: string[]): string {
  const sorted = [...new Set(districtDescriptors)].sort();
  return createHash("sha256")
    .update(`v1|${electionId}|${sorted.join("|")}`)
    .digest("base64url")
    .slice(0, 22);
}

export const BALLOT_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;
