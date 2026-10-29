# Official campaign-site and X links per candidate, from official filings only (never guessed):
#   - CA SoS Official Voter Information Guide candidate statements (statewide
#     offices): the contact block at the end of each statement ("X:",
#     "Website:", or a bare domain line), else a site the candidate names in the
#     statement that matches their campaign e-mail domain or carries their surname.
#   - San Mateo County roster of candidates: the "Website" field (local and
#     district contests). Contact details in the roster are never read.
# Keys match the contests in the normalized ballot fixture (enrichment keys).
#   python3 -I scripts/lib/gen_ca_official_links.py <vig-dir> <smc-roster.txt> <fixture.json> <out.json>
import html, json, re, sys, unicodedata

vig_dir, roster_txt, fixture, out = sys.argv[1:5]
VIG = "https://voterguide.sos.ca.gov/candidates/{}-candidate-statements.htm"
ROSTER = "https://smcacre.gov/system/files/2026-09/52_candidateroster0903.pdf"
ACCESSED = "2026-10-29"
PAGES = {  # VIG page → ballot contest title(s)
    "governor": ["Governor"], "lt-governor": ["Lieutenant Governor"], "sos": ["Secretary of State"],
    "controller": ["Controller"], "treasurer": ["Treasurer"], "attorney-general": ["Attorney General"],
    "insurance-commissioner": ["Insurance Commissioner"], "superintendent": ["Superintendent of Public Instruction"],
    "boe": ["Member, State Board of Equalization, District 2"],
}
SOCIAL = re.compile(r"(facebook|instagram|twitter|x\.com|tiktok|youtube|linkedin|threads|bsky)\.", re.I)

def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def site(raw):
    raw = raw.strip().rstrip(".,;)")
    if not raw or "@" in raw or SOCIAL.search(raw) or not re.search(r"[a-z0-9-]+\.[a-z]{2,}", raw, re.I):
        return None
    url = raw if re.match(r"https?://", raw, re.I) else "https://" + raw
    m = re.match(r"(https?://)([^/]+)(.*)", url, re.I)
    return (m.group(1).lower() + m.group(2).lower() + m.group(3)).rstrip("/")

def x_url(raw):
    raw = raw.strip()
    m = re.search(r"(?:twitter\.com|x\.com)/@?([A-Za-z0-9_]{1,15})", raw, re.I) or re.fullmatch(r"@([A-Za-z0-9_]{1,15})", raw)
    return f"https://x.com/{m.group(1)}" if m else None

ballot = json.load(open(fixture))
def contest_by_title(title):
    return next((c for c in ballot["contests"] if c["title"] == title), None)
def ckey(c, name):
    return f"{norm(c['division']['name'])}|{norm(c['title'])}::{norm(name)}"

bundle = {"election": "2026-11-03", "sources": {}, "candidates": {}}
def add(contest, ballot_name, kind, url, sid):
    entry = bundle["candidates"].setdefault(ckey(contest, ballot_name), {"links": []})
    if not any(l["kind"] == kind for l in entry["links"]):
        entry["links"].append({"kind": kind, "url": url, "sources": [sid]})

# --- SoS voter guide statements
for page, titles in PAGES.items():
    try:
        s = html.unescape(open(f"{vig_dir}/st-{page}.html", encoding="utf-8").read())
    except FileNotFoundError:
        continue
    sid = f"sos-vig-statements-{page}"
    bundle["sources"][sid] = {"title": f"Candidate statements: {page.replace('-', ' ')} (Official Voter Information Guide)", "publisher": "California Secretary of State", "url": VIG.format(page), "official": True, "accessed": ACCESSED}
    for seg in s.split("<h2>")[1:]:
        name = seg.split("</h2>")[0].split("|")[0].strip()
        body = seg.split("Candidate Template End")[0]
        paras = re.findall(r"<p>(.*?)</p>", body, re.S)
        if not paras:
            continue
        contact = [l.strip() for l in re.sub(r"<[^>]+>", "\n", paras[-1]).split("\n") if l.strip()]
        statement = re.sub(r"<[^>]+>", " ", " ".join(paras[:-1]))
        for t in titles:
            c = contest_by_title(t)
            if not c:
                continue
            choice = next((ch for ch in c["choices"] if norm(ch["ballotName"]) == norm(name)), None)
            if not choice:
                continue
            web = next((site(l.split(":", 1)[1]) for l in contact if re.match(r"(website|web)\s*:", l, re.I)), None)
            if not web:  # a bare domain on its own line in the contact block (first one: later ones tend to be causes)
                web = next((site(l) for l in contact if ":" not in l and "@" not in l and re.fullmatch(r"(?:https?://)?(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?:/\S*)?", l)), None)
            if not web:  # a site the candidate names in their own statement that carries their surname
                last = norm(re.sub(r"\([^)]*\)", " ", name)).split()[-1]
                web = next((site(u) for u in re.findall(r"(?:https?://)?(?:www\.)?[A-Za-z0-9-]+\.[A-Za-z.]{2,}(?:/\S*)?", statement) if last in u.lower()), None)
            if not web:
                email = next((re.search(r"@([a-z0-9.-]+\.[a-z]{2,})", l, re.I).group(1).lower() for l in contact if re.search(r"@[a-z0-9.-]+\.[a-z]{2,}", l, re.I)), None)
                if email and not re.search(r"(gmail|yahoo|hotmail|outlook|aol|icloud|me)\.com$", email):
                    named = [u for u in re.findall(r"(?:https?://)?(?:www\.)?[A-Za-z0-9-]+\.[A-Za-z.]{2,}(?:/\S*)?", statement) if email in u.lower()]
                    web = site(named[0]) if named else None
            if web:
                add(c, choice["ballotName"], "campaign", web, sid)
            xl = next((x_url(l.split(":", 1)[1]) for l in contact if re.match(r"(x|twitter)\s*:", l, re.I)), None)
            if xl:
                add(c, choice["ballotName"], "x", xl, sid)

# --- San Mateo County roster: "Website" field only
lines = open(roster_txt, encoding="utf-8", errors="ignore").read().split("\n")
cur_title, cur_name = None, None
bundle["sources"]["smc-roster-2026-11"] = {"title": "Roster of Candidates, November 3, 2026 (Sept 3)", "publisher": "San Mateo County Elections", "url": ROSTER, "official": True, "accessed": ACCESSED}
for l in lines:
    m = re.match(r"^\d{4}\s{2,}(\S.*?)\s{3,}Vote for", l)
    if m:
        cur_title, cur_name = m.group(1), None
        continue
    q = re.match(r"^\s+Qualified:\s+\d+\s+(\S.*?)(?:\s{2,}|$)", l)
    if q:
        cur_name = re.sub(r"\s+(DEM|REP|NPP|GRN|LIB|PF|AI)$", "", q.group(1)).strip()
        continue
    w = re.search(r"Website:\s+(\S+)", l)
    if w and cur_title and cur_name:
        c = contest_by_title(cur_title)
        web = site(w.group(1)) if "not" not in w.group(1).lower() else None
        if c and web:
            choice = next((ch for ch in c["choices"] if norm(ch["ballotName"]) == norm(cur_name)), None)
            if choice:
                add(c, choice["ballotName"], "campaign", web, "smc-roster-2026-11")

json.dump(bundle, open(out, "w"), indent=2, ensure_ascii=False)
for k, v in bundle["candidates"].items():
    print(k, "|", ", ".join(f"{l['kind']}={l['url']}" for l in v["links"]))
print(len(bundle["candidates"]), "candidates with official links")
