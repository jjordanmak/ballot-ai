import type { Contest, DistrictKind, DistrictRef } from "./ballot";

const DISTRICT_ORDER: DistrictKind[] = ["congressional", "state_lower", "state_upper", "board_of_equalization"];

/**
 * Districts for the address: from OCD division ids (e.g. Civic divisionsByAddress) when
 * available, else from official contest titles. The Board of Equalization
 * district only appears in contest titles ("…Board of Equalization, District 2").
 */
export function districtsFrom(divisionIds: string[], contests: Contest[]): DistrictRef[] {
  const found = new Map<DistrictKind, DistrictRef>();
  const add = (kind: DistrictKind, number: string, ocdId?: string) => {
    if (!found.has(kind)) found.set(kind, { kind, number: number.replace(/^0+(?=\d)/, ""), ocdId });
  };
  for (const id of divisionIds) {
    const m = /\/(cd|sldl|sldu):([a-z0-9-]+)$/i.exec(id);
    if (!m) continue;
    add(m[1] === "cd" ? "congressional" : m[1] === "sldl" ? "state_lower" : "state_upper", m[2], id);
  }
  for (const c of contests) {
    const t = c.title;
    let m: RegExpExecArray | null;
    if ((m = /Representative\b.*District\s+(\d+)/i.exec(t))) add("congressional", m[1]);
    else if ((m = /\bAssembly\b.*District\s+(\d+)/i.exec(t))) add("state_lower", m[1]);
    else if ((m = /State Senat(?:e|or)\b.*District\s+(\d+)/i.exec(t))) add("state_upper", m[1]);
    else if ((m = /Board of Equalization\b.*District\s+(\d+)/i.exec(t))) add("board_of_equalization", m[1]);
  }
  return DISTRICT_ORDER.flatMap((k) => (found.has(k) ? [found.get(k)!] : []));
}
