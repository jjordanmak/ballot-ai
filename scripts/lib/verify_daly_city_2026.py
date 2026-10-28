# Compare the normalized Daly City ballot fixture against official sources
# (CA SoS certified list + qualified measures; Daly City Clerk nominee list).
# Writes reports/2026-11-03/daly-city-verification.{json,md}. No address involved.
#   python3 -I scripts/lib/verify_daly_city_2026.py <cert.txt> <qbm.html> <dalycity-muni.html>
import json, re, sys, html, unicodedata
cert_txt, qbm_html, muni_html = sys.argv[1:4]
FIX = "fixtures/ballots/2026-11-03/daly-city.normalized.json"
ACCESSED = "2026-10-28"
SRC = {
    "cert": "https://elections.cdn.sos.ca.gov/statewide-elections/2026-general/cert-list-candidates.pdf",
    "qbm": "https://www.sos.ca.gov/elections/ballot-measures/qualified-ballot-measures",
    "dc": "https://www.dalycity.org/1325/2026-Municipal-Election",
}

def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower().replace("*", "")).strip()

# --- certified list: section -> [(name, party, designation, incumbent)]
raw = [l for l in open(cert_txt, encoding="utf-8", errors="ignore").read().split("\n")
       if l.strip() and not re.search(r"Page \d+ of \d+|General Election - November|Official Certified List|^\s*\d+/\d+/2026\s*$", l)]
sections, cur = {}, None
for i, l in enumerate(raw):
    if re.match(r"^\s{25,}\S", l) and not l.strip().startswith("•"):
        cur = l.strip(); sections.setdefault(cur, []); continue
    m = re.match(r"^\s{4,12}(\S.*?\S)\s{3,}(Democratic|Republican|Non-Partisan|Green|Libertarian|Peace and Freedom|American Independent|No Party Preference)\s*$", l)
    if cur and m:
        desig = raw[i + 1].strip() if i + 1 < len(raw) and re.match(r"^\s{10,}\S", raw[i + 1]) and not re.search(r"\s{3,}(Democratic|Republican)", raw[i + 1]) else None
        sections[cur].append({"name": m.group(1).rstrip("*").strip(), "party": m.group(2), "designation": desig, "incumbent": m.group(1).strip().endswith("*")})

CERT_TITLE = {  # ballot contest title -> certified-list section
    "governor": "Governor", "lieutenant governor": "Lieutenant Governor", "secretary of state": "Secretary of State",
    "controller": "Controller", "treasurer": "Treasurer", "attorney general": "Attorney General",
    "insurance commissioner": "Insurance Commissioner", "superintendent of public instruction": "Superintendent of Public Instruction",
    "member state board of equalization district 2": "Board of Equalization Member District 2",
    "u s representative district 15": "United States Representative District 15",
    "member of the state assembly district 19": "State Assembly Member District 19",
}

# --- qualified statewide measures
def lines_of(path):
    s = open(path, encoding="utf-8", errors="ignore").read()
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    return [x.strip() for x in html.unescape(re.sub(r"<[^>]+>", "\n", s)).split("\n") if x.strip()]
Q = lines_of(qbm_html)
props = {re.fullmatch(r"Proposition (\d+)", l).group(1): Q[i + 1] for i, l in enumerate(Q) if re.fullmatch(r"Proposition (\d+)", l)}

# --- Daly City nominees (name lines precede "View Statement"/dates)
M = lines_of(muni_html)
dc_names = []
for l in M:
    m = re.match(r"^([A-Z][a-zA-ZñÑ.\- ]+?)\s{2,}(July|August)\s", l)
    if m: dc_names.append(m.group(1).strip())

ballot = json.load(open(FIX))
rows = []
for c in ballot["contests"]:
    t = norm(c["title"]); row = {"contest": c["title"], "kind": c["kind"], "category": c["category"]}
    if c["kind"] == "measure":
        ident = (c.get("measure") or {}).get("identifier") or ""
        n = re.match(r"Proposition (\d+)", ident)
        if n:
            ok = n.group(1) in props
            row.update(status="verified" if ok else "discrepancy", source=SRC["qbm"],
                       note=f"Listed as Proposition {n.group(1)}: {props.get(n.group(1), 'NOT LISTED')}")
        else:
            row.update(status="unverified", source=None, note="Local measure: needs San Mateo County Elections (smcacre.gov), which is not reachable from this environment yet")
    elif c["category"] == "judicial":
        row.update(status="verified", source=SRC["cert"], note="Added from the certified list (missing from provider data)")
    elif t in CERT_TITLE:
        official = sections.get(CERT_TITLE[t], [])
        prov = [(norm(ch["ballotName"]), ch.get("party")) for ch in c["choices"]]
        off = [(norm(o["name"]), o["party"]) for o in official]
        names_ok = sorted(p[0] for p in prov) == sorted(o[0] for o in off)
        party_ok = all((dict(off).get(n) or "").replace("Non-Partisan", "") == (p or "").replace("Nonpartisan", "") or (dict(off).get(n) == "Non-Partisan" and not p) for n, p in prov)
        row.update(status="verified" if names_ok and party_ok else "discrepancy", source=SRC["cert"],
                   note="; ".join(f"{o['name']} ({o['party']}{', incumbent' if o['incumbent'] else ''}) — ballot designation: {o['designation']}" for o in official),
                   official=official)
    elif "daly city" in t and "city council" in t:
        prov = sorted(norm(ch["ballotName"]) for ch in c["choices"])
        off = sorted(norm(n) for n in dc_names)
        ok = prov == off and c.get("voteFor") == 3
        row.update(status="verified" if ok else "discrepancy", source=SRC["dc"],
                   note=f"City Clerk list of nominees (updated 8/8/26): {', '.join(dc_names)}; 3 seats")
    else:
        row.update(status="unverified", source=None, note="County/district contest: needs San Mateo County Elections (smcacre.gov), not reachable yet")
    rows.append(row)

summary = {s: sum(1 for r in rows if r["status"] == s) for s in ("verified", "discrepancy", "unverified")}
json.dump({"generated": ACCESSED, "summary": summary, "rows": rows}, open("reports/2026-11-03/daly-city-verification.json", "w"), indent=2, ensure_ascii=False)

md = ["# Daly City reference ballot — official verification", "",
      f"Checked {ACCESSED} against official sources. **{summary['verified']} verified · {summary['discrepancy']} discrepancies · {summary['unverified']} not yet verifiable.**", "",
      "Sources: [CA SoS Certified List of Candidates](%s) · [CA SoS Qualified Statewide Ballot Measures](%s) · [Daly City Clerk — 2026 Municipal Election](%s)" % (SRC["cert"], SRC["qbm"], SRC["dc"]), "",
      "| Contest | Status | Official source | Notes |", "|---|---|---|---|"]
for r in rows:
    md.append(f"| {r['contest']} | {r['status']} | {('[link](' + r['source'] + ')') if r['source'] else '—'} | {r['note'].replace('|', '/')} |")
open("reports/2026-11-03/daly-city-verification.md", "w").write("\n".join(md) + "\n")
print(summary)
for r in rows:
    if r["status"] != "verified": print(r["status"], "|", r["contest"], "|", r["note"][:140])
