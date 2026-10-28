/**
 * Voter-facing copy for every resolution status. A failure must never read
 * as "nothing is on your ballot" — each state says what happened and what
 * to do next.
 */
import type { CoarseLocation, ResolutionStatus } from "@/domain/ballot";

export const STATUS_COPY: Record<Exclude<ResolutionStatus, "SUCCESS">, { title: string; body: string }> = {
  PARTIAL: {
    title: "Some details may be incomplete",
    body: "We found your ballot, but our data source didn't return complete information for every contest. Compare with your official sample ballot from your county elections office.",
  },
  INVALID_ADDRESS: {
    title: "We couldn't find that address",
    body: "Check the street number, street name, city, and state, then try again. Use the address where you're registered to vote.",
  },
  AMBIGUOUS_ADDRESS: {
    title: "That address matches more than one place",
    body: "Add a unit or apartment number, city, and ZIP code so we can find your exact ballot.",
  },
  ELECTION_NOT_FOUND: {
    title: "We don't have this election yet",
    body: "Ballot data for this election isn't available from our source right now. Your county elections office has your official sample ballot.",
  },
  NO_COVERAGE: {
    title: "Ballot details aren't available for this address yet",
    body: "This doesn't mean nothing is on your ballot. Our data source hasn't published contests for this location yet. Your county elections office has your official sample ballot.",
  },
  RATE_LIMITED: {
    title: "Lots of people are looking up ballots right now",
    body: "Please wait a minute and try again.",
  },
  PROVIDER_ERROR: {
    title: "We couldn't reach our ballot data source",
    body: "This is a problem on our end, not with your address. Please try again in a moment.",
  },
};

export function isResolutionStatus(s: string | undefined): s is ResolutionStatus {
  return !!s && (s === "SUCCESS" || s in STATUS_COPY);
}

/** "DALY CITY" → "Daly City"; leaves mixed-case input alone. */
function tidyCity(city: string): string {
  if (city !== city.toUpperCase()) return city;
  return city.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** Coarse, shareable location label. Never includes a street or ZIP. */
export function locationLabel(loc: CoarseLocation): string {
  const parts = [loc.city ? tidyCity(loc.city) : loc.county, loc.state].filter(Boolean);
  return parts.join(", ");
}

/** Date-only strings render in local time without a UTC shift. */
export function formatElectionDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
