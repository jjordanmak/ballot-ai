# Parse judicial retention contests from the CA SoS "Certified List of Candidates"
# (pdftotext -layout output) into an official-records file. Verbatim names/wording.
#   python3 -I scripts/lib/parse_ca_cert_judicial.py cert.txt out.json
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
raw = open(src, encoding="utf-8", errors="ignore").read().split("\n")
lines = [l for l in raw if l.strip() and not re.search(r"Page \d+ of \d+|General Election - November|Official Certified List|^\s*\d+/\d+/2026\s*$", l)]

contests, i = [], 0
ALL_CA = None
while i < len(lines):
    l = lines[i].strip()
    m = re.match(r"^(Supreme Court)\s*[-–]\s*For all 58 Counties$", l) or re.match(r"^Court of Appeal\s*[-–]\s*(\w+) Appellate District$", l)
    if not m:
        i += 1
        continue
    court = "Supreme Court" if m.group(1) == "Supreme Court" else f"Court of Appeal, {m.group(1)} Appellate District"
    i += 1
    counties = []
    while i < len(lines) and not lines[i].strip().startswith("•"):
        nxt = lines[i].strip()
        if re.match(r"^(Supreme Court|Court of Appeal)", nxt):
            break
        counties += [c.strip() for c in nxt.split(",") if c.strip()]
        i += 1
    while i < len(lines) and lines[i].strip().startswith("•"):
        office = re.sub(r"^•\s*For\s+", "", lines[i].strip())
        q = []
        i += 1
        while i < len(lines) and not lines[i].strip().startswith("•") and not re.match(r"^(Supreme Court|Court of Appeal)", lines[i].strip()):
            q.append(lines[i].strip())
            i += 1
        question = " ".join(q)
        # The justice's name is the run of ALL-CAPS words right before "be elected".
        nm = re.search(r"\b((?:[A-Z][A-Z.'\-]+\s+)*[A-Z][A-Z.'\-]+)\s+be elected", question)
        contests.append({
            "court": court,
            "office": office,
            "question": question,
            "justice": nm.group(1).strip() if nm else None,
            "appliesTo": {"state": "CA", **({"counties": counties} if counties else {})},
        })

doc = {
    "election": "2026-11-03",
    "source": {
        "id": "sos-cert-list-2026-general",
        "title": "Certified List of Candidates for the November 3, 2026, General Election (Aug 27, 2026)",
        "publisher": "California Secretary of State",
        "url": "https://elections.cdn.sos.ca.gov/statewide-elections/2026-general/cert-list-candidates.pdf",
        "official": True,
        "accessed": "2026-10-28",
    },
    "contests": contests,
}
json.dump(doc, open(out, "w"), indent=2, ensure_ascii=False)
print(len(contests), "retention contests;", sorted({c["court"] for c in contests}))
print("missing justice name:", [c["office"] for c in contests if not c["justice"]])
