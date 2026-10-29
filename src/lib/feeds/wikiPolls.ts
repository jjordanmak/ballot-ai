/**
 * Wikipedia poll tables → structured polls. Pure (no I/O), unit-tested.
 *
 * Election pages keep polling as wikitext tables:
 *
 *   {| class="wikitable"
 *   ! Poll source !! Date(s)<br />administered !! Sample<br />size !! Margin<br />of error
 *   ! Xavier<br />Becerra (D) !! Steve<br />Hilton (R) !! Undecided
 *   |-
 *   | [https://… Emerson College] || October 1–3, 2026 || 1,000 (LV) || ± 3.0% || 45% || 40% || 15%
 *   |}
 *
 * A table is used only when every candidate column matches a candidate in
 * the contest (or Yes/No for a measure), so primary, hypothetical and
 * other-district tables on the same page are ignored. Rows are checked by
 * `checkPoll`; nothing is inferred.
 */
import { normalizeForMatch } from "@/domain/text";

export interface WikiPollRow {
  pollster: string;
  /** Pollster's own release, from the row's link or citation. */
  releaseUrl?: string;
  /** Footnote / label text that may mark a sponsored or partisan poll. */
  notes: string;
  dates: string;
  start?: string;
  end?: string;
  sample?: number;
  population?: string;
  moe?: number;
  /** Percent by column header (candidate name, "Yes"/"No"), plus other/undecided. */
  values: { header: string; pct: number }[];
  other?: number;
  undecided?: number;
}

export interface WikiPollTable {
  headers: string[];
  rows: WikiPollRow[];
}

/* ─── wikitext cleanup ────────────────────────────────────────────── */

const URL_RE = /https?:\/\/[^\s|\]}<]+/;

/** Split on a separator only at bracket depth 0 ([[ ]], {{ }}, [ ]). */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "[[" || two === "{{") {
      depth++;
      cur += two;
      i++;
      continue;
    }
    if ((two === "]]" || two === "}}") && depth > 0) {
      depth--;
      cur += two;
      i++;
      continue;
    }
    if (s[i] === "[") depth++;
    else if (s[i] === "]" && depth > 0) depth--;
    if (depth === 0 && s.slice(i, i + sep.length) === sep) {
      out.push(cur);
      cur = "";
      i += sep.length - 1;
      continue;
    }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

/** A cell's content without its attributes (`style="…" | 45%` → `45%`). */
function cellContent(raw: string): { attrs: string; content: string } {
  const parts = splitTop(raw, "|");
  if (parts.length > 1 && /^[\s\w-]+=|^\s*\{\{\s*party shading|^\s*$/i.test(parts[0]) && !/^\s*\[/.test(parts[0])) {
    return { attrs: parts[0], content: parts.slice(1).join("|") };
  }
  return { attrs: "", content: raw };
}

/** Text a reader sees; notes (refs, efn) are collected separately. */
export function plainWikitext(s: string): string {
  return s
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/\{\{\s*(?:efn|efn-ua|efn-lr|refn|ref label|r)\b[^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*\}\}/gi, "")
    .replace(/\{\{\s*(?:nowrap|nobr|small|sort\|[^|}]*)\|([^{}]*)\}\}/gi, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1")
    .replace(/\[https?:\/\/\S+\]/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/'{2,}/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&plusmn;/g, "±")
    .replace(/\s+/g, " ")
    .trim();
}

function notesOf(s: string): string {
  const notes = [...s.matchAll(/\{\{\s*(?:efn|efn-ua|efn-lr|refn)\b([^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*)\}\}/gi)].map((m) => m[1]);
  const refs = [...s.matchAll(/<ref[^>]*>([\s\S]*?)<\/ref>/gi)].map((m) => m[1]);
  return plainWikitext([...notes, ...refs].join(" ")).slice(0, 500);
}

function firstUrl(s: string): string | undefined {
  const direct = /\[(https?:\/\/[^\s\]]+)/.exec(s)?.[1];
  if (direct) return direct;
  const cite = /\|\s*url\s*=\s*(https?:\/\/[^\s|}]+)/i.exec(s)?.[1];
  return cite ?? URL_RE.exec(s)?.[0];
}

function pct(s: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(plainWikitext(s));
  return m ? Number(m[1]) : undefined;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * "October 1–3, 2026", "Sep 28 – Oct 2, 2026", "October 5, 2026" → start / end (YYYY-MM-DD).
 */
export function parsePollDates(raw: string): { start?: string; end?: string } {
  const s = plainWikitext(raw).replace(/[–—-]/g, "-").replace(/\s+/g, " ");
  const year = Number(/(\d{4})\s*$/.exec(s)?.[1]);
  if (!year) return {};
  const mon = (t: string) => MONTHS[t.slice(0, 4).toLowerCase().replace(/\.$/, "")] ?? MONTHS[t.slice(0, 3).toLowerCase()];
  let m = /^([A-Za-z]+)\.? (\d{1,2}) ?- ?([A-Za-z]+)\.? (\d{1,2}),? \d{4}$/.exec(s);
  if (m && mon(m[1]) && mon(m[3])) {
    const sm = mon(m[1]);
    const em = mon(m[3]);
    return { start: iso(sm > em ? year - 1 : year, sm, +m[2]), end: iso(year, em, +m[4]) };
  }
  m = /^([A-Za-z]+)\.? (\d{1,2}) ?- ?(\d{1,2}),? \d{4}$/.exec(s);
  if (m && mon(m[1])) return { start: iso(year, mon(m[1]), +m[2]), end: iso(year, mon(m[1]), +m[3]) };
  m = /^([A-Za-z]+)\.? (\d{1,2}),? \d{4}$/.exec(s);
  if (m && mon(m[1])) return { start: iso(year, mon(m[1]), +m[2]), end: iso(year, mon(m[1]), +m[2]) };
  return {};
}

/* ─── tables ──────────────────────────────────────────────────────── */

const COL = {
  source: /poll source|pollster/i,
  dates: /date/i,
  sample: /sample/i,
  moe: /margin/i,
  other: /^other|^someone else|^others/i,
  undecided: /undecided|don.?t know|unsure|no opinion/i,
};

/** Every poll table in a page's wikitext. */
export function parsePollTables(wikitext: string): WikiPollTable[] {
  const tables: WikiPollTable[] = [];
  for (const block of `\n${wikitext}`.split(/\n\{\|/).slice(1)) {
    const body = block.split(/\n\|\}/)[0];
    const rowsRaw = body.split(/\n\|-[^\n]*/);
    let headers: string[] = [];
    const rows: WikiPollRow[] = [];
    const carry: { cell: string; left: number }[] = [];
    for (const rowRaw of rowsRaw) {
      const lines = rowRaw.split("\n").filter((l) => /^[!|]/.test(l) && !/^\|\+/.test(l) && !/^\{\|/.test(l));
      if (!lines.length) continue;
      if (lines.every((l) => l.startsWith("!"))) {
        headers = lines.flatMap((l) => splitTop(l.slice(1), "!!")).map((c) => plainWikitext(cellContent(c).content));
        continue;
      }
      if (!headers.length) continue;
      const raw = lines.flatMap((l) => splitTop(l.slice(1), "||"));
      // Re-insert cells carried down by rowspan from the rows above.
      const cells: string[] = [];
      let ri = 0;
      for (let col = 0; col < headers.length; col++) {
        const c = carry[col];
        if (c && c.left > 0) {
          cells.push(c.cell);
          c.left--;
          continue;
        }
        const cell = raw[ri++];
        if (cell === undefined) break;
        cells.push(cell);
        const span = Number(/rowspan\s*=\s*"?(\d+)/i.exec(cellContent(cell).attrs)?.[1] ?? 1);
        carry[col] = { cell, left: span - 1 };
      }
      const get = (re: RegExp) => {
        const i = headers.findIndex((h) => re.test(h));
        return i >= 0 ? cells[i] : undefined;
      };
      const source = get(COL.source);
      if (!source) continue;
      const sourceContent = cellContent(source).content;
      const dates = plainWikitext(cellContent(get(COL.dates) ?? "").content);
      const sampleText = plainWikitext(cellContent(get(COL.sample) ?? "").content);
      const moeText = plainWikitext(cellContent(get(COL.moe) ?? "").content);
      const values: WikiPollRow["values"] = [];
      let other: number | undefined;
      let undecided: number | undefined;
      headers.forEach((h, i) => {
        if (Object.values(COL).slice(0, 4).some((re) => re.test(h)) || i >= cells.length) return;
        const v = pct(cellContent(cells[i]).content);
        if (COL.other.test(h)) other = v;
        else if (COL.undecided.test(h)) undecided = v;
        else if (v !== undefined) values.push({ header: h, pct: v });
      });
      const { start, end } = parsePollDates(dates);
      rows.push({
        pollster: plainWikitext(sourceContent),
        releaseUrl: firstUrl(sourceContent),
        notes: notesOf(sourceContent),
        dates,
        start,
        end,
        sample: Number(/([\d,]+)/.exec(sampleText)?.[1]?.replace(/,/g, "")) || undefined,
        population: /\((LV|RV|A|V)\)/i.exec(sampleText)?.[1]?.toUpperCase(),
        moe: Number(/(\d+(?:\.\d+)?)/.exec(moeText)?.[1]) || undefined,
        values,
        other,
        undecided,
      });
    }
    if (headers.length && rows.length) tables.push({ headers, rows });
  }
  return tables;
}

/* ─── matching to a contest ───────────────────────────────────────── */

export interface ContestCandidates {
  /** Measures are polled as Yes / No. */
  measure: boolean;
  candidates: { id: string; names: string[] }[];
}

/** "Xavier Becerra (D)" → "xavier becerra". */
const headerName = (h: string) => normalizeForMatch(h.replace(/\([^)]*\)/g, " "));

function nameMatches(header: string, names: string[]): boolean {
  const h = headerName(header).split(" ").filter(Boolean);
  if (!h.length) return false;
  return names.some((n) => {
    const t = normalizeForMatch(n.replace(/\([^)]*\)/g, " ")).split(" ").filter((x) => x && !["jr", "sr", "ii", "iii", "iv"].includes(x));
    if (!t.length) return false;
    const last = t[t.length - 1];
    // Last name must match; a first name or initial, when the header has one, must agree.
    return h[h.length - 1] === last && (h.length === 1 || h[0][0] === t[0][0]);
  });
}

/**
 * Column → candidate id for a table, or null unless every polled column is a
 * candidate in this contest (≥ 2 of them) — or Yes/No for a measure.
 */
export function matchTable(table: WikiPollTable, contest: ContestCandidates): Map<string, string> | null {
  const polled = [...new Set(table.rows.flatMap((r) => r.values.map((v) => v.header)))];
  if (contest.measure) {
    const yes = polled.find((h) => /^(yes|for|support)\b/i.test(h));
    const no = polled.find((h) => /^(no|against|oppose)\b/i.test(h));
    return yes && no && polled.length === 2 ? new Map([[yes, "yes"], [no, "no"]]) : null;
  }
  if (polled.length < 2) return null;
  const map = new Map<string, string>();
  for (const h of polled) {
    const c = contest.candidates.find((k) => nameMatches(h, k.names));
    if (!c || [...map.values()].includes(c.id)) return null;
    map.set(h, c.id);
  }
  return map;
}

/* ─── checks ──────────────────────────────────────────────────────── */

export interface Pollster {
  name: string;
  aliases?: string[];
}

/** The approved pollster this row names, if any (by name or alias). */
export function approvedPollster(row: WikiPollRow, approved: Pollster[]): Pollster | undefined {
  const p = normalizeForMatch(row.pollster.replace(/\([^)]*\)/g, " "));
  return approved.find((a) => [a.name, ...(a.aliases ?? [])].some((n) => {
    const k = normalizeForMatch(n);
    return p === k || p.startsWith(`${k} `) || p.includes(` ${k} `) || p.endsWith(` ${k}`);
  }));
}

export type PollVerdict = { ok: true; pollster: Pollster } | { ok: false; reason: string };

const MAX_AGE_DAYS = 60;

/** Publish only complete, recent polls from approved, unsponsored pollsters. */
export function checkPoll(row: WikiPollRow, approved: Pollster[], now: Date): PollVerdict {
  if (/\((?:D|R|L|G)\)|sponsored by|internal poll|commissioned by|for the .* campaign/i.test(`${row.pollster} ${row.notes}`)) {
    return { ok: false, reason: "sponsored or partisan" };
  }
  const pollster = approvedPollster(row, approved);
  if (!pollster) return { ok: false, reason: "pollster not on the approved list" };
  if (!row.end || !row.sample || !row.moe) return { ok: false, reason: "missing dates, sample size or margin of error" };
  const end = Date.parse(`${row.end}T23:59:59Z`);
  if (end > now.getTime() + 86_400_000) return { ok: false, reason: "fielded in the future" };
  if (now.getTime() - end > MAX_AGE_DAYS * 86_400_000) return { ok: false, reason: "older than 60 days" };
  return { ok: true, pollster };
}
