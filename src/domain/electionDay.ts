/**
 * Today's date (YYYY-MM-DD) in Hawaii, where the last US polls close. An
 * election stays current through its whole day everywhere in the country;
 * the UTC date flips at 4 pm Pacific on election day, while polls are open.
 */
export function electionToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Honolulu", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
