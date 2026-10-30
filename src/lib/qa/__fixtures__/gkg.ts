/** A GKG 2.1 line with 27 tab-separated columns; fictional values. */
export function gkgLine(o: { domain: string; url: string; persons?: string; title?: string }): string {
  const f = Array<string>(27).fill("");
  f[0] = "20261030224500-1";
  f[1] = "20261030224500";
  f[2] = "1";
  f[3] = o.domain;
  f[4] = o.url;
  f[11] = o.persons ?? "";
  f[26] = `<PAGE_LINKS></PAGE_LINKS><PAGE_TITLE>${o.title ?? ""}</PAGE_TITLE>`;
  return f.join("\t");
}
