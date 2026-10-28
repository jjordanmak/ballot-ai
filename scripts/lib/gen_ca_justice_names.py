# Build an enrichment bundle of OFFICIAL proper-case names for every CA
# judicial retention contest, from the SoS Official Voter Information Guide
# justices pages (Supreme Court + six Court of Appeal district pages).
#   python3 -I scripts/lib/gen_ca_justice_names.py <pages-dir> <retention.json> <out.json>
# <pages-dir> holds supreme-court-justices.html and d1.html … d6.html, saved from
#   https://voterguide.sos.ca.gov/justices/supreme-court-justices/index.htm
#   https://voterguide.sos.ca.gov/justices/courts-of-appeal/district{1..6}.htm
import html, json, os, re, sys, unicodedata
pages, retention, out = sys.argv[1:4]
BASE = "https://voterguide.sos.ca.gov/justices"
ORD = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"]

def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def read(name):
    return html.unescape(open(os.path.join(pages, name), encoding="utf-8").read())

# court name (as in the retention file) → list of official names on that page
official = {}
sc = read("supreme-court-justices.html")
official["Supreme Court"] = [n.strip().rstrip(",").strip() for n in re.findall(r"<p><strong>([^<]+?),\s*</strong>\s*(?:Associate|Chief) Justice", sc)]
for i in range(6):
    page = read(f"d{i + 1}.html")
    official[f"Court of Appeal, {ORD[i]} Appellate District"] = re.findall(r'<li[^>]*>(?:<a href="https://appellate\.courts\.ca\.gov[^"]*">|<strong>)?\s*([^<,]+),\s*(?:Administrative )?(?:Associate|Presiding) Justice', page)

def match(ballot_name, names):
    toks = norm(ballot_name).split()
    first, last = toks[0], toks[-1]
    hits = [n for n in names if norm(n).split()[0] == first and norm(n).split()[-1] == last]
    return hits[0] if len(hits) == 1 else None

data = json.load(open(retention))
bundle = {"election": "2026-11-03", "sources": {}, "candidates": {}}
missing = []
for c in data["contests"]:
    court, office, justice = c["court"], c["office"], c["justice"]
    if court == "Supreme Court":
        sid, url = "sos-vig-justices-supreme", f"{BASE}/supreme-court-justices/index.htm"
        title = "Justices of the Supreme Court (Official Voter Information Guide)"
    else:
        d = ORD.index(court.split(", ")[1].split()[0]) + 1
        sid, url = f"sos-vig-justices-district{d}", f"{BASE}/courts-of-appeal/district{d}.htm"
        title = f"Courts of Appeal, {ORD[d - 1]} District (Official Voter Information Guide)"
    name = match(justice, official.get(court, []))
    if not name:
        missing.append(f"{court} | {justice}")
        continue
    bundle["sources"][sid] = {"title": title, "publisher": "California Secretary of State", "url": url, "official": True, "accessed": "2026-10-28"}
    bundle["candidates"][f"{norm(court)}|{norm(office)}::{norm(justice)}"] = {"displayName": name, "incumbent": True}

json.dump(bundle, open(out, "w"), ensure_ascii=False, indent=2)
print(f"{len(bundle['candidates'])} names matched, {len(missing)} unmatched")
for m in missing:
    print("  unmatched:", m)
