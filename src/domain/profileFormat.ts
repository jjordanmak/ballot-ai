/**
 * How profile facts read on ballot.ai, written by code so every candidate's
 * lines look the same whichever model found the facts (owner, 2026-10-29).
 * Pure; used by the research job and the page.
 */

export interface EducationEntry {
  degree: string;
  field?: string;
  institution: string;
  year?: number;
}

export interface PositionEntry {
  title: string;
  organization?: string;
  district?: string;
  startYear?: number;
  /** A year, or "present". */
  endYear?: number | "present";
  committees?: string[];
}

const DEGREES: [RegExp, string][] = [
  [/^(juris doctor(ate)?|j\.?\s?d\.?)$/i, "J.D."],
  [/^(bachelor of arts|b\.?\s?a\.?|a\.?\s?b\.?)$/i, "B.A."],
  [/^(bachelor of science|b\.?\s?s\.?)$/i, "B.S."],
  [/^(master of arts|m\.?\s?a\.?)$/i, "M.A."],
  [/^(master of science|m\.?\s?s\.?)$/i, "M.S."],
  [/^(master of business administration|m\.?\s?b\.?\s?a\.?)$/i, "M.B.A."],
  [/^(master of public policy|m\.?\s?p\.?\s?p\.?)$/i, "M.P.P."],
  [/^(master of public administration|m\.?\s?p\.?\s?a\.?)$/i, "M.P.A."],
  [/^(master of public health|m\.?\s?p\.?\s?h\.?)$/i, "M.P.H."],
  [/^(master of laws|ll\.?\s?m\.?)$/i, "LL.M."],
  [/^(doctor of philosophy|ph\.?\s?d\.?)$/i, "Ph.D."],
  [/^(doctor of medicine|m\.?\s?d\.?)$/i, "M.D."],
  [/^(doctor of education|ed\.?\s?d\.?)$/i, "Ed.D."],
  [/^(associate of arts|a\.?\s?a\.?)$/i, "A.A."],
  [/^(associate of science|a\.?\s?s\.?)$/i, "A.S."],
];

/** "Juris Doctor degree" / "JD" → "J.D."; anything else is kept as the source wrote it. */
export function degreeLabel(degree: string): string {
  const d = degree.trim().replace(/\s+degree$/i, "").replace(/^(a|an)\s+/i, "");
  for (const [re, label] of DEGREES) if (re.test(d)) return label;
  return d;
}

/** "J.D., Stanford Law School · 1984" / "B.A., Economics, Stanford University". */
export function educationLine(e: EducationEntry): string {
  return [degreeLabel(e.degree), e.field, e.institution].filter(Boolean).join(", ") + (e.year ? ` · ${e.year}` : "");
}

/** "1987–1990", "2019–present", "1990", "from 1992", "until 1990", or "". */
export function positionYears(p: Pick<PositionEntry, "startYear" | "endYear">): string {
  const { startYear: s, endYear: e } = p;
  if (s && e === "present") return `${s}–present`;
  if (s && e) return s === e ? `${s}` : `${s}–${e}`;
  if (s) return `from ${s}`;
  if (e === "present") return "present";
  if (e) return `until ${e}`;
  return "";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "Deputy Attorney General, California Department of Justice (59th District) · 1987–1990". */
export function positionLine(p: PositionEntry): string {
  const org = p.organization && !norm(p.title).includes(norm(p.organization)) ? p.organization : undefined;
  const district = p.district && !norm(`${p.title} ${org ?? ""}`).includes(norm(p.district)) ? p.district : undefined;
  const years = positionYears(p);
  return `${[p.title, org].filter(Boolean).join(", ")}${district ? ` (${district})` : ""}${years ? ` · ${years}` : ""}`;
}

export function committeesLine(p: PositionEntry): string | null {
  return p.committees?.length ? `Committees: ${p.committees.join(", ")}` : null;
}

/** Newest first: current roles, then by end year, then start year; undated last, in their original order. */
export function sortPositions<T extends PositionEntry>(list: T[]): T[] {
  const key = (p: T) => {
    const end = p.endYear === "present" ? 9999 : p.endYear ?? p.startYear ?? -1;
    return [end, p.startYear ?? end] as const;
  };
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const [ae, as] = key(a.p);
      const [be, bs] = key(b.p);
      return be - ae || bs - as || a.i - b.i;
    })
    .map((x) => x.p);
}
