# Build an enrichment bundle of OFFICIAL candidate facts (proper-case name,
# ballot designation, incumbency) from the CA SoS certified list, keyed to
# the contests in a normalized ballot fixture.
#   python3 -I scripts/lib/gen_ca_cert_candidates.py <cert.txt> <fixture.json> <out.json>
import json, re, sys, unicodedata
cert_txt, fixture, out = sys.argv[1:4]
URL = "https://elections.cdn.sos.ca.gov/statewide-elections/2026-general/cert-list-candidates.pdf"

def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower().replace("*", "")).strip()

raw = [l for l in open(cert_txt, encoding="utf-8", errors="ignore").read().split("\n")
       if l.strip() and not re.search(r"Page \d+ of \d+|General Election - November|Official Certified List|^\s*\d+/\d+/2026\s*$", l)]
sections, cur = {}, None
for i, l in enumerate(raw):
    if re.match(r"^\s{25,}\S", l) and not l.strip().startswith("•"):
        cur = l.strip(); sections.setdefault(cur, []); continue
    m = re.match(r"^\s{4,12}(\S.*?\S)\s{3,}(Democratic|Republican|Non-Partisan|Green|Libertarian|Peace and Freedom|American Independent|No Party Preference)\s*$", l)
    if cur and m:
        nxt = raw[i + 1] if i + 1 < len(raw) else ""
        desig = nxt.strip() if re.match(r"^\s{10,}\S", nxt) and not re.search(r"\s{3,}(Democratic|Republican|Non-Partisan)", nxt) and not nxt.strip().startswith("*") else None
        sections[cur].append({"name": m.group(1).rstrip("*").strip(), "incumbent": m.group(1).strip().endswith("*"), "designation": desig})

CERT_TITLE = {
    "governor": "Governor", "lieutenant governor": "Lieutenant Governor", "secretary of state": "Secretary of State",
    "controller": "Controller", "treasurer": "Treasurer", "attorney general": "Attorney General",
    "insurance commissioner": "Insurance Commissioner", "superintendent of public instruction": "Superintendent of Public Instruction",
    "member state board of equalization district 2": "Board of Equalization Member District 2",
    "u s representative district 15": "United States Representative District 15",
    "member of the state assembly district 19": "State Assembly Member District 19",
}
ballot = json.load(open(fixture))
bundle = {"election": "2026-11-03", "sources": {"sos-cert-list-2026-general": {
    "title": "Certified List of Candidates for the November 3, 2026, General Election (Aug 27, 2026)",
    "publisher": "California Secretary of State", "url": URL, "official": True, "accessed": "2026-10-28"}}, "candidates": {}}
cite = ["sos-cert-list-2026-general"]
for c in ballot["contests"]:
    sec = CERT_TITLE.get(norm(c["title"]))
    if not sec: continue
    ckey = f"{norm(c['division']['name'])}|{norm(c['title'])}"
    for o in sections.get(sec, []):
        match = next((ch for ch in c["choices"] if norm(ch["ballotName"]) == norm(o["name"])), None)
        if not match: continue
        e = {"displayName": o["name"]}
        if o["designation"]:
            e["ballotDesignation"] = {"text": o["designation"], "sources": cite}
        if o["incumbent"]:
            e["incumbent"] = True
        bundle["candidates"][f"{ckey}::{norm(match['ballotName'])}"] = e
json.dump(bundle, open(out, "w"), indent=2, ensure_ascii=False)
print(len(bundle["candidates"]), "candidates")
