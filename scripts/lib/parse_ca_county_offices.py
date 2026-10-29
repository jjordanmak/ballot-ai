# Build the California county elections office list (name, website, phone)
# from the Secretary of State's "County Elections Offices" page, keyed by the
# county's OCD division id. Used to hand voters off to their county when an
# address can't be matched to a ballot (cross streets, business addresses).
#   python3 -I scripts/lib/parse_ca_county_offices.py <offices.html> <out.json>
# Source: https://www.sos.ca.gov/elections/voting-resources/county-elections-offices
import html, json, re, sys

src, out = sys.argv[1:3]
URL = "https://www.sos.ca.gov/elections/voting-resources/county-elections-offices"
page = open(src, encoding="utf-8", errors="ignore").read()

blocks = re.findall(r'<h2>\s*<a href="([^"]+)"[^>]*>([^<]+)</a>(?:\s|&nbsp;)*</h2>(.*?)(?=<h2|</main>|$)', page, flags=re.S)
offices = {}
for url, name, body in blocks:
    name = html.unescape(name).replace("\xa0", " ").strip()
    text = html.unescape(re.sub(r"<[^>]+>", "\n", body)).replace("\xa0", " ")
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    # First number listed that isn't a fax ("(530) 552-3400, option 1" keeps its note).
    phone = next((l for l in lines if re.match(r"\(\d{3}\) \d{3}-\d{4}", l) and "fax" not in l.lower()), None)
    ocd = "ocd-division/country:us/state:ca/county:" + re.sub(r"[^a-z]+", "_", name.lower()).strip("_")
    offices[ocd] = {"county": f"{name} County", "url": url.strip(), "phone": phone}

if len(offices) != 58:
    sys.exit(f"expected 58 California counties, parsed {len(offices)}")
json.dump(
    {"state": "CA", "source": {"title": "County Elections Offices", "publisher": "California Secretary of State", "url": URL, "accessed": "2026-10-29"}, "offices": offices},
    open(out, "w"),
    indent=2,
    ensure_ascii=False,
)
print(f"{len(offices)} counties")
