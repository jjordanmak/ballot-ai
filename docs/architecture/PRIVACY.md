# Privacy: Residential Address Handling

> Product requirement: [PRD §15](../product/PRD.md#15-privacy-requirements)

## 1. Rule

A residential address is used **once, server-side**, to ask the ballot resolver which contests apply. After that it is discarded.

## 2. Address lifecycle

| Stage | Where the address exists | Retention |
|---|---|---|
| Typed in the form | Browser input field | Until navigation. Not in `localStorage`. Browser autofill is off (`autocomplete="off"`), since our own suggestion list replaces it |
| Address suggestions (while typing) | Partial input in an HTTPS POST to `/api/address/suggest`, forwarded to Google Places API (New) `places:autocomplete`. Picking a suggestion sends only Google's place ID to `/api/address/place`, which returns the full formatted address | Request memory only. Not logged (the Places client logs only op, HTTP status and latency), not cached (`no-store`). Same-site requests only: the proxy refuses any request that has neither `Sec-Fetch-Site: same-origin` nor an `Origin` matching the site, so scripts can't use it as an open Places proxy (a Vercel firewall rate limit on `/api/address/` is a pending owner action). Suggestion and lookup calls share a random session token made in the browser, which carries no identity. The monthly usage counter (`api_usage`) stores only a month, a metric name and a count |
| Submitted | HTTPS POST body to the Next.js server action | Request memory only |
| Resolution | `AddressInput` wrapper → Google Civic `voterinfo` request, then `divisionsByAddress` for the district list (query param, per the API) | Request memory only. The wrapper's `toString`/`toJSON` redact it. A Civic error logs only Google's reason code and HTTP status, never Google's message text, which can echo the request |
| After resolution | **Nowhere.** The normalized ballot carries only coarse location (city, county, state, 5-digit ZIP), the district list (e.g. CA-15, AD-19) and district descriptors. The ZIP is shown in the sidebar and header (owner decision 2026-10-29); it covers tens of thousands of people and is never combined with a street | — |

The address is **never**:
- written to Supabase;
- included in logs or error reports (the logger redacts by type and by pattern: street-number + street-suffix regex as a safety net);
- sent to Anthropic;
- included in analytics events;
- placed in a URL, redirect, or `searchParams`;
- included in committed fixtures or reports.

Google's `normalizedInput` echo is dropped during normalization.

Google (Civic for the ballot, Places for suggestions) is the only third party that receives the address or any part of it. The landing page says so next to the field.

## 3. Ballot key

`ballotKey = base64url(sha256("v1|" + electionId + "|" + sorted(districtDescriptors).join("|")))[0..22]`

- **District descriptors** are the contests' division keys (`st:scope:id:name`, or the state's OCD id for a statewide contest; see [DATA_MODEL](./DATA_MODEL.md) §4), plus the OCD division ids from `divisionsByAddress` (`ocd:…`) and the ZIP (`zip:94015`), so the key identifies a **set of electoral districts within a ZIP**. That set is shared by every household with the same ballot and ZIP. It is not derived from the street address. (Districts without a race this year, like a State Senate seat, are in the key so households in different districts never share a cached page.)
- `precinctId` is **not** used, because a precinct is a smaller geography.
- **Residual risk:** the set of districts reveals approximate geography, roughly the intersection of districts, which is typically thousands of voters. The same information is displayed on the page itself.

## 4. Stored data (`ballot_resolutions`)

The table holds the normalized ballot JSON (contests, choices, sources), coarse location, provider, status, `retrieved_at`, and `expires_at`.

- **No address, no IP, no user agent, no user ID.**
- RLS has no public policies. Reads go through the server.

## 5. Provider cache terms

Google API terms limit caching to what the API's caching headers allow, and require the data to be fresh. ballot.ai therefore:
- sets `expires_at = retrieved_at + min(Cache-Control max-age, 24h)`, defaulting to 6h when no header is present;
- purges expired rows with a scheduled cleanup (P1) and filters them at read time regardless (P0);
- treats expired keys as "re-enter your address", never as stale data.

**Owner action:** review the current Google APIs Terms of Service and the Civic Information API terms before increasing any TTL. Durable records are built only from official sources ([DATA_MODEL](./DATA_MODEL.md) §5).

## 6. Metrics (`resolution_events`)

Allowed fields are timestamp, provider, status, latency, contest count, state code, warning codes, and cache hit. That excludes city, ballot key, address fragments, and any identifier.

## 7. Pages

- `/ballot/*` pages send `robots: noindex, nofollow` and `Referrer-Policy: same-origin`.
- Location context is shown as "Daly City, CA", never the street.
- Links are shareable: the ballot key points to a geography, not a person, and it expires.

## 8. Live feeds

Collectors (`src/lib/feeds/`, `/api/cron/*`) work from the election's durable contests and candidates and approved public sources (news outlets' feeds, Wikipedia poll tables, candidates' own campaign sites). They never receive an address, ballot key or location. Outbound fetches go only to public hosts (`safeFetch.ts`). `feed_items` and `candidate_links` hold only public article, poll and campaign data. Ballot pages read them with the anon key; RLS shows only published items.

New items reach open pages over Realtime Broadcast on a topic named only by election and state (`feed:{election}:{ST}`). The message is the public item itself (title, publisher, link, contest and candidate ids); it carries no address, ballot key or anything about the viewer, and each page filters by contest id in the browser.

## 9. QA

`BALLOT_QA_ADDRESS_94015` (and any other QA address) is read from the environment only by `scripts/qa-resolve.ts`. The output fixtures and reports contain only normalized, address-free data. CI never has access to QA addresses.

The national test list (`src/lib/qa/matrix.ts`) looks up public locations: city halls, official governors' residences and public-university residence halls. It never uses a private home. The list lives only in the private env var `QA_CIVIC_BUILDINGS`, and the addresses go only to the ballot provider. Results in `qa_runs` carry each location's label ("WA · Seattle City Hall") and the provider's ballot wording, never the address. The run saves no ballot and registers no contests. Its daily cron was removed on 2026-10-30, because most states' data only answers residential address ranges.

**One-time county sweep** (owner, 2026-10-30). `/api/cron/qa-counties` and `src/lib/qa/countySweep.ts` look up one address per county, about 3,143 counties, to catch naming and display quirks nationwide.
- **How each address is built:** in memory, from the Census Bureau's public-domain TIGER/Line address ranges (`src/lib/qa/tiger.ts`). It takes the middle house number of a residential road segment's official range, in the county's most common ZIP.
- **Privacy:** the number is synthetic, never picked from a list of homes, and no information about any person is involved.
- **Where the address goes:** only to the ballot provider, and it is then discarded. It is never logged, stored or committed.
- **What `qa_runs` keeps:** only "ST · County (FIPS)", the status, and the provider's wording.
- **When it ends:** it stops by itself once every county is stored, and its cron entry is then removed.
