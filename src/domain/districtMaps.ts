import type { Contest, DistrictKind } from "./ballot";
import { contestKind } from "./districts";
import registry from "@/data/official/district-maps.json";

/**
 * Provider district names can carry the year of the map they use
 * ("19th Assembly District - 2022"). The year is split off for display and
 * explained from a cited registry; an unlisted year says only what the data
 * says. Keys built from the raw name are unaffected.
 */

const YEAR_SUFFIX = /\s*(?:[-–—]\s*|\(\s*)?(199\d|20\d{2})\s*\)?\s*$/;

export function splitMapYear(name: string): { name: string; mapYear?: string } {
  const m = YEAR_SUFFIX.exec(name);
  // Keep names that are only a year, or where the year is the whole point ("2024 Bond").
  if (!m || m.index === 0) return { name };
  return { name: name.slice(0, m.index).trim(), mapYear: m[1] };
}

export interface MapNote {
  text: string;
  source?: { name: string; url: string };
}

interface MapEntry {
  state: string;
  kinds: string[];
  year: string;
  text: string;
  lastElection?: string;
  source: string;
}

const SOURCES = registry.sources as Record<string, { name: string; url: string }>;
const MAPS = registry.maps as MapEntry[];

export function mapYearNote(year: string, state: string | undefined, kind: DistrictKind | undefined): MapNote {
  const st = state?.toUpperCase();
  const entry = kind && st ? MAPS.find((e) => e.state === st && e.year === year && e.kinds.includes(kind)) : undefined;
  if (!entry) return { text: `District lines from the map labeled ${year} in the official ballot data.` };
  return {
    text: entry.lastElection ? `${entry.text} Used through the ${entry.lastElection} election.` : entry.text,
    source: SOURCES[entry.source],
  };
}

/** A contest's division name without its map year, plus the note explaining the year. */
export function divisionLabel(c: Contest, state?: string): { jurisdiction: string; jurisdictionNote?: MapNote } {
  const { name, mapYear } = splitMapYear(c.division.name || "");
  return { jurisdiction: name, jurisdictionNote: mapYear ? mapYearNote(mapYear, state, contestKind(c)) : undefined };
}
