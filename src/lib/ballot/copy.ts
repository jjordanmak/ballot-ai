/**
 * Voter-facing copy for every resolution status. A failure must never read
 * as "nothing is on your ballot" — each state says what happened and what
 * to do next.
 */
import type { CoarseLocation, ResolutionStatus } from "@/domain/ballot";

export const STATUS_COPY: Record<Exclude<ResolutionStatus, "SUCCESS">, { title: string; body: string }> = {
  PARTIAL: {
    title: "Some details may be incomplete",
    body: "We found your ballot, but our data source didn't return complete information for every contest. Compare with your official sample ballot from your local election office.",
  },
  INVALID_ADDRESS: {
    title: "We couldn't find that address",
    body: "Check the street number, street name, city, state, and ZIP code, or pick your address from the suggestions as you type. Use the address where you're registered to vote.",
  },
  AMBIGUOUS_ADDRESS: {
    title: "That address matches more than one place",
    body: "Add the city and ZIP code so we can find your exact ballot.",
  },
  ELECTION_NOT_FOUND: {
    title: "We don't have this election yet",
    body: "Ballot data for this election isn't available from our source right now. Your local election office has your official sample ballot.",
  },
  NO_COVERAGE: {
    title: "We couldn't find a ballot for this address",
    body: "This doesn't mean nothing is on your ballot. Our ballot data matches home street addresses; business addresses, cross streets, and city or ZIP alone usually can't be matched, and some areas haven't been published yet. Try your full home address with city, state, and ZIP code, or pick it from the suggestions as you type. Your local election office also has your official sample ballot.",
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

/**
 * No ballot for input without a house number. Google's ballot data only
 * matches home street addresses, so voters registered with cross streets or
 * a description of where they live are sent to their state's official
 * voter lookup, which finds them by name and date of birth.
 */
export const NO_STREET_NUMBER_COPY = {
  title: "We need a home street address to look up a ballot",
  body: "Registered with cross streets or a description of where you live instead of a street address? Your state's official voter lookup can find your registration using your name and date of birth, and shows how to reach your local election office for your sample ballot.",
};

/** Typed address without a ZIP or a city and state (checked before asking the provider). */
export const INCOMPLETE_ADDRESS_COPY = {
  title: "Enter your full address",
  body: "Include the city, state, and ZIP code (for example, 123 Main St, Daly City, CA 94015), or pick your address from the suggestions as you type.",
};

/** National fallback when the provider didn't name a state election office (NASS "Can I Vote"). */
export const STATE_LOOKUP_FALLBACK = { label: "Find your state's election office", url: "https://www.canivote.org/" };

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

/** Sidebar / header location line: "Daly City, CA · 94015". Never a street. */
export function locationLine(loc: CoarseLocation): string {
  const label = locationLabel(loc);
  return loc.zip ? `${label} · ${loc.zip}` : label;
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
