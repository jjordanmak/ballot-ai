# Parse CA SoS Quick Reference Guide pages (official) into an enrichment bundle. Verbatim text only.
import re, html, json, sys, os
src_dir, qbm_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
ACCESSED = "2026-10-28"

def text_of(path):
    s = open(path, encoding="utf-8", errors="ignore").read()
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", "\n", s))
    return [l.strip() for l in t.split("\n") if l.strip()]

# Official sentence-case titles from the Qualified Statewide Ballot Measures page.
q = text_of(qbm_path)
titles = {}
for i, l in enumerate(q):
    m = re.fullmatch(r"Proposition (\d+)", l)
    if m and i + 1 < len(q):
        titles[m.group(1)] = q[i + 1]

def between(lines, start, stops):
    out, on = [], False
    for l in lines:
        if not on and re.fullmatch(start, l, re.I):
            on = True
            continue
        if on and any(re.fullmatch(s, l, re.I) for s in stops):
            break
        if on:
            out.append(l)
    return " ".join(out).strip()

bundle = {"election": "2026-11-03", "sources": {
    "sos-qualified-measures": {"title": "Qualified Statewide Ballot Measures", "publisher": "California Secretary of State",
                               "url": "https://www.sos.ca.gov/elections/ballot-measures/qualified-ballot-measures", "official": True, "accessed": ACCESSED}},
    "measures": {}}
for fn in sorted(os.listdir(src_dir), key=lambda f: int(f.split(".")[0])):
    n = fn.split(".")[0]
    L = text_of(os.path.join(src_dir, fn))
    sid = f"sos-vig-qrg-prop-{n}"
    url = f"https://voterguide.sos.ca.gov/quick-reference-guide/{n}.htm"
    bundle["sources"][sid] = {"title": f"Proposition {n} — Quick Reference Guide, Official Voter Information Guide (Nov 3, 2026)",
                              "publisher": "California Secretary of State", "url": url, "official": True, "accessed": ACCESSED}
    summary_block = between(L, "SUMMARY", [r"WHAT YOUR VOTE MEANS"])
    put_by = re.match(r"(Put on the Ballot by [^A-Z]*?(?:Legislature|Petition Signatures))\s*", summary_block)
    rest = summary_block[put_by.end():] if put_by else summary_block
    fiscal_m = re.search(r"Fiscal Impact\s*:\s*(.*?)\s*(Supporters\s*:|$)", rest)
    summary = rest[: fiscal_m.start()].strip() if fiscal_m else rest
    fiscal = fiscal_m.group(1).strip() if fiscal_m else None
    sup = re.search(r"Supporters\s*:\s*(.*?)\s*(Opponents\s*:|$)", rest)
    opp = re.search(r"Opponents\s*:\s*(.*)$", rest)
    yes = between(L, "YES", ["NO"])
    no = between(L, "NO", ["ARGUMENTS"])
    pro = between(L, "PRO", ["CON"])
    con = between(L, "CON", ["FOR ADDITIONAL INFORMATION"])
    clean = lambda s: re.sub(r"^A (YES|NO) vote on this measure means:\s*", "", s).strip()
    cite = [sid]
    m = {
        "title": (titles.get(n) or "").strip() or None,
        "summary": {"text": (put_by.group(1).strip() + ". " if put_by else "") + summary, "sources": cite},
        "yesMeans": {"text": clean(yes), "sources": cite},
        "noMeans": {"text": clean(no), "sources": cite},
        "officialUrl": f"https://voterguide.sos.ca.gov/propositions/{n}/",
    }
    if fiscal: m["fiscalEffect"] = {"text": fiscal, "sources": cite}
    if pro: m["argumentFor"] = {"text": pro, "sources": cite}
    if con: m["argumentAgainst"] = {"text": con, "sources": cite}
    if sup: m["supporters"] = {"text": sup.group(1).strip(), "sources": cite}
    if opp: m["opponents"] = {"text": opp.group(1).strip(), "sources": cite}
    bundle["measures"][f"california|proposition {n}"] = m
json.dump(bundle, open(out_path, "w"), indent=2, ensure_ascii=False)
print(len(bundle["measures"]), "measures;", sum(1 for v in bundle["measures"].values() if v["title"]), "titled")
