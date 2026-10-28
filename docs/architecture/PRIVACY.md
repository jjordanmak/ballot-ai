# Privacy: Residential Address Handling

> Product requirement: [PRD §15](../product/PRD.md#15-privacy-requirements)

## 1. Rule

A residential address is used **once, server-side**, to ask the ballot resolver which contests apply. After that it is discarded.

## 2. Address lifecycle

| Stage | Where the address exists | Retention |
|---|---|---|
| Typed in the form | Browser input field | Until navigation. Not in `localStorage`. With autocomplete off, the browser may still remember form values per user settings |
| Submitted | HTTPS POST body to the Next.js server action | Request memory only |
| Resolution | `AddressInput` wrapper → Google Civic `voterinfo` request (query param, per the API) | Request memory only. The wrapper's `toString`/`toJSON` redact it |
| After resolution | **Nowhere.** The normalized ballot carries only coarse location (city, county, state) and district descriptors | — |

The address is **never**:
- written to Supabase;
- included in logs or error reports (the logger redacts by type and by pattern: street-number + street-suffix regex as a safety net);
- sent to Anthropic;
- included in analytics events;
- placed in a URL, redirect, or `searchParams`;
- included in committed fixtures or reports.

Google's `normalizedInput` echo is dropped during normalization.

## 3. Ballot key

`ballotKey = base64url(sha256("v1|" + electionId + "|" + sorted(districtDescriptors).join("|")))[0..22]`

- **District descriptors** are `scope:id:name` from the contests returned, so the key identifies a **set of electoral districts**. That set is shared by every household with the same ballot. It is not derived from the address string.
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

## 8. QA

`BALLOT_QA_ADDRESS_94015` (and any other QA address) is read from the environment only by `scripts/qa-resolve.ts`. The output fixtures and reports contain only normalized, address-free data. CI never has access to QA addresses.
