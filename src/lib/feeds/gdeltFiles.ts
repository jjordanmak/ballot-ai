/**
 * GDELT's 15-minute data files (owner, 2026-10-30): the same article index
 * as GDELT's search API, published as static files, so no search throttle.
 * `lastupdate.txt` names the newest files; the GKG ("Global Knowledge
 * Graph") file lists every article GDELT read in those 15 minutes with its
 * URL, outlet domain, the people it names and its page title. Pure parsing.
 */

export const GDELT_LASTUPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";

export interface GdeltFile {
  size: number;
  url: string;
}

/** The GKG entry of lastupdate.txt ("<bytes> <md5> <url>" per line). */
export function parseLastUpdate(text: string): GdeltFile | null {
  for (const line of text.split(/\r?\n/)) {
    const [size, , url] = line.trim().split(/\s+/);
    if (url && /\.gkg\.csv\.zip$/i.test(url) && /^\d+$/.test(size)) return { size: Number(size), url };
  }
  return null;
}

export interface GkgRow {
  /** Outlet domain as GDELT writes it ("politico.com"). */
  domain: string;
  url: string;
  /** "YYYYMMDDHHMMSS", when GDELT read it. */
  date: string;
  /** Lowercase full names GDELT found in the text ("xavier becerra"). */
  persons: string[];
  title: string;
}

// GKG 2.1 columns (tab-separated, 27 per row).
const COL = { date: 1, domain: 3, url: 4, persons: 11, extras: 26 } as const;

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** One GKG line, or null when it isn't a web article with a URL. */
export function parseGkgRow(line: string): GkgRow | null {
  const f = line.split("\t");
  if (f.length < 27) return null;
  const url = f[COL.url];
  if (!/^https?:\/\//i.test(url)) return null;
  const title = /<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/.exec(f[COL.extras])?.[1] ?? "";
  return {
    domain: f[COL.domain].toLowerCase(),
    url,
    date: f[COL.date],
    persons: f[COL.persons] ? [...new Set(f[COL.persons].split(";").map((p) => p.trim().toLowerCase()).filter(Boolean))] : [],
    title: decodeEntities(title).trim(),
  };
}
