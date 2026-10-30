/**
 * Census TIGER/Line address ranges (public domain), for the one-time county
 * sweep (owner, 2026-10-30). Pure: a minimal zip reader, a dBASE reader, and
 * the rule that turns a county's road segments into test addresses.
 *
 * A test address is the middle house number of a residential road segment's
 * official address range, on that side's odd/even parity. Google matches
 * addresses to precincts by these same ranges, so it resolves; the number is
 * synthetic and is never stored.
 */
import { inflateRawSync } from "node:zlib";

export interface County {
  /** USPS code, e.g. "CA". */
  state: string;
  /** 5-digit FIPS, e.g. "06059". */
  fips: string;
  name: string;
}

/** 50 states and DC; territories have no Nov 3 ballots in our data. */
const TERRITORIES = new Set(["AS", "GU", "MP", "PR", "UM", "VI"]);

/** Census's national county file: "STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT". */
export function parseCountyList(text: string): County[] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("|"))
    .filter((f) => f.length >= 5 && /^\d{2}$/.test(f[1]) && /^\d{3}$/.test(f[2]) && !TERRITORIES.has(f[0]))
    .map((f) => ({ state: f[0], fips: `${f[1]}${f[2]}`, name: f[4].trim() }));
}

/** The first file in a zip archive whose name ends with `suffix`. */
export function readZipEntry(zip: Uint8Array, suffix: string): Uint8Array | null {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  // End of central directory: scan back over a possible trailing comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries && at + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    if (name.toLowerCase().endsWith(suffix.toLowerCase())) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return new Uint8Array(data);
      if (method === 8) return new Uint8Array(inflateRawSync(data));
      return null;
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Rows of a dBASE III file, only the named fields, values trimmed; `keep` drops rows while reading (large counties). */
export function readDbf(dbf: Uint8Array, wanted: string[], keep: (row: Record<string, string>) => boolean = () => true): Record<string, string>[] {
  const buf = Buffer.from(dbf.buffer, dbf.byteOffset, dbf.byteLength);
  if (buf.length < 32) return [];
  const count = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);
  const fields: { name: string; offset: number; length: number }[] = [];
  let offset = 1; // each record starts with a deletion flag
  for (let at = 32; at + 32 <= headerLen && buf[at] !== 0x0d; at += 32) {
    const name = buf.toString("latin1", at, at + 11).replace(/\0.*$/, "").trim();
    const length = buf[at + 16];
    fields.push({ name, offset, length });
    offset += length;
  }
  const picked = fields.filter((f) => wanted.includes(f.name));
  const rows: Record<string, string>[] = [];
  for (let r = 0; r < count; r++) {
    const start = headerLen + r * recordLen;
    if (start + recordLen > buf.length) break;
    if (buf[start] === 0x2a) continue; // deleted
    const row: Record<string, string> = {};
    for (const f of picked) row[f.name] = buf.toString("utf8", start + f.offset, start + f.offset + f.length).trim();
    if (keep(row)) rows.push(row);
  }
  return rows;
}

export const ADDRFEAT_FIELDS = ["FULLNAME", "LFROMHN", "LTOHN", "RFROMHN", "RTOHN", "ZIPL", "ZIPR", "ROAD_MTFCC"];

/** S1400: local neighborhood road, rural road or city street. */
const RESIDENTIAL_ROAD = "S1400";

/** For readDbf: keep only residential road segments. */
export const isResidentialRoad = (row: Record<string, string>) => !row.ROAD_MTFCC || row.ROAD_MTFCC === RESIDENTIAL_ROAD;

interface Side {
  street: string;
  from: number;
  to: number;
  zip: string;
}

function sides(row: Record<string, string>): Side[] {
  if (row.ROAD_MTFCC && row.ROAD_MTFCC !== RESIDENTIAL_ROAD) return [];
  const street = row.FULLNAME;
  if (!street) return [];
  const out: Side[] = [];
  for (const [f, t, z] of [["LFROMHN", "LTOHN", "ZIPL"], ["RFROMHN", "RTOHN", "ZIPR"]] as const) {
    // Plain numbers only: ranges like "N123" or "12A" don't build a clean address.
    if (/^\d{1,6}$/.test(row[f] ?? "") && /^\d{1,6}$/.test(row[t] ?? "") && /^\d{5}$/.test(row[z] ?? "")) {
      out.push({ street, from: Number(row[f]), to: Number(row[t]), zip: row[z] });
    }
  }
  return out;
}

/** The middle of a range, on the range's own odd/even side. */
export function midNumber(from: number, to: number): number {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let n = lo + Math.floor((hi - lo) / 2);
  if (n % 2 !== lo % 2) n += (n + 1 <= hi ? 1 : -1);
  return Math.max(lo, n);
}

/**
 * Up to `max` test addresses for a county: residential roads in its most
 * common ZIP code, in a fixed order (street name), first and middle.
 */
export function countyAddresses(rows: Record<string, string>[], state: string, max = 2): string[] {
  const all = rows.flatMap(sides).filter((s) => s.from > 0 || s.to > 0);
  if (!all.length) return [];
  const byZip = new Map<string, Side[]>();
  for (const s of all) byZip.set(s.zip, [...(byZip.get(s.zip) ?? []), s]);
  const [, inZip] = [...byZip.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  const ordered = [...inZip].sort((a, b) => a.street.localeCompare(b.street) || a.from - b.from);
  const picks = [ordered[0], ordered[Math.floor(ordered.length / 2)]].filter((s, i, xs) => s && xs.indexOf(s) === i);
  return picks.slice(0, max).map((s) => `${midNumber(s.from, s.to)} ${s.street}, ${state} ${s.zip}`);
}

export const tigerYear = 2024;
export const countyListUrl = "https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt";
export const addrfeatUrl = (fips: string) => `https://www2.census.gov/geo/tiger/TIGER${tigerYear}/ADDRFEAT/tl_${tigerYear}_${fips}_addrfeat.zip`;
