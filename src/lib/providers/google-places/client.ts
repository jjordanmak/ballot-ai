/**
 * Address suggestions via Google Places API (New), server only.
 *
 * - Key from GOOGLE_PLACES_API_KEY; sent as a header, never logged, never
 *   sent to the browser.
 * - What the visitor typed is forwarded to Google and nowhere else: not
 *   logged, not cached, not stored (docs/architecture/PRIVACY.md).
 * - Calls share a browser-generated session token, so a pick from the list
 *   followed by one place lookup bills as a single session.
 * - Every call first takes one unit of the monthly budget (src/lib/usage/quota.ts),
 *   which keeps usage inside Google's free tier unless the limits are raised.
 * - Any failure returns an empty result; typing the address still works.
 */
import "server-only";
import { logEvent } from "@/lib/observability/log";
import { consumeQuota, type QuotaMetric } from "@/lib/usage/quota";

const BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 4000;

export interface AddressSuggestion {
  placeId: string;
  /** Street line, e.g. "123 Main St". */
  main: string;
  /** City / state line, e.g. "Daly City, CA, USA". */
  secondary: string;
}

interface AutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }[];
}

export interface PlacesClientOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  /** Monthly budget check; defaults to the Supabase-backed counter. */
  consume?: (metric: QuotaMetric) => Promise<boolean>;
}

export class GooglePlacesClient {
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly consume: (metric: QuotaMetric) => Promise<boolean>;

  constructor(opts: PlacesClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.consume = opts.consume ?? consumeQuota;
  }

  get configured(): boolean {
    return !!this.apiKey;
  }

  /** US street-address suggestions for partial input. */
  async suggest(input: string, sessionToken: string): Promise<AddressSuggestion[]> {
    const body = await this.call<AutocompleteResponse>("places.autocomplete", `${BASE}/places:autocomplete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input,
        sessionToken,
        includedRegionCodes: ["us"],
        includedPrimaryTypes: ["street_address", "premise", "subpremise"],
        languageCode: "en",
      }),
    });
    return (body?.suggestions ?? []).flatMap(({ placePrediction: p }) => {
      if (!p?.placeId) return [];
      const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
      return main ? [{ placeId: p.placeId, main, secondary: p.structuredFormat?.secondaryText?.text ?? "" }] : [];
    });
  }

  /** Full formatted address (with ZIP) for a picked suggestion; closes the session. */
  async address(placeId: string, sessionToken: string): Promise<string | undefined> {
    const url = `${BASE}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
    const body = await this.call<{ formattedAddress?: string }>("places.details", url, {
      method: "GET",
      headers: { "x-goog-fieldmask": "formattedAddress" },
    });
    return body?.formattedAddress;
  }

  private async call<T>(op: QuotaMetric, url: string, init: RequestInit): Promise<T | undefined> {
    if (!this.apiKey) {
      logEvent("places.not_configured", { op });
      return undefined;
    }
    if (!(await this.consume(op))) return undefined;
    const started = Date.now();
    try {
      const res = await this.fetchImpl(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), "x-goog-api-key": this.apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      logEvent(res.ok ? "places.ok" : "places.error", { op, status: res.status, latency_ms: Date.now() - started });
      return res.ok ? ((await res.json()) as T) : undefined;
    } catch (e) {
      logEvent("places.network_error", { op, error: e instanceof Error ? e.name : "unknown" });
      return undefined;
    }
  }
}
