/**
 * Minimal Google Civic Information API v2 HTTP client (server only).
 *
 * - Key from GOOGLE_CIVIC_API_KEY; never logged, never sent to the browser.
 * - 8s timeout, one retry (with jitter) on 5xx/timeout/network; none on 4xx.
 * - Responses are NOT cached by URL: the voterinfo URL contains the address.
 *   Caching happens downstream on the address-free normalized ballot.
 */
import "server-only";
import { logEvent } from "@/lib/observability/log";
import type { AddressInput } from "../address";
import type { CivicDivisionsByAddressResponse, CivicElectionsResponse, CivicVoterInfoResponse, GoogleApiError } from "./types";

const BASE = "https://www.googleapis.com/civicinfo/v2";
const TIMEOUT_MS = 8000;

export type CivicFailure =
  | "INVALID_ADDRESS"
  | "AMBIGUOUS_ADDRESS"
  | "ELECTION_NOT_FOUND"
  | "NO_COVERAGE"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR";

export type CivicCall<T> =
  | { ok: true; body: T; maxAgeSeconds?: number }
  | { ok: false; failure: CivicFailure; httpStatus?: number; reason?: string };

export interface CivicClientOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class GoogleCivicClient {
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CivicClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.GOOGLE_CIVIC_API_KEY;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get configured(): boolean {
    return !!this.apiKey;
  }

  elections(): Promise<CivicCall<CivicElectionsResponse>> {
    return this.get<CivicElectionsResponse>("/elections", {}, "elections");
  }

  voterInfo(address: AddressInput, electionId: string): Promise<CivicCall<CivicVoterInfoResponse>> {
    return this.get<CivicVoterInfoResponse>(
      "/voterinfo",
      { address: address.reveal(), electionId, returnAllAvailableData: "true" },
      "voterinfo",
    );
  }

  /** OCD division ids for the address (congressional, legislative, county, city…), with no election data. */
  divisions(address: AddressInput): Promise<CivicCall<CivicDivisionsByAddressResponse>> {
    return this.get<CivicDivisionsByAddressResponse>("/divisionsByAddress", { address: address.reveal() }, "divisions");
  }

  private async get<T>(path: string, params: Record<string, string>, op: string): Promise<CivicCall<T>> {
    if (!this.apiKey) {
      logEvent("civic.not_configured", { op });
      return { ok: false, failure: "PROVIDER_ERROR", reason: "GOOGLE_CIVIC_API_KEY not set" };
    }
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("key", this.apiKey);

    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      try {
        const res = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        const latency = Date.now() - started;
        if (res.ok) {
          logEvent("civic.ok", { op, status: res.status, latency_ms: latency });
          return { ok: true, body: (await res.json()) as T, maxAgeSeconds: parseMaxAge(res.headers.get("cache-control")) };
        }
        const err = (await res.json().catch(() => ({}))) as GoogleApiError;
        const reason = err.error?.errors?.[0]?.reason ?? err.error?.status;
        const message = err.error?.message ?? err.error?.errors?.[0]?.message ?? "";
        // Only the reason code: Google's message text can echo the request.
        logEvent("civic.error", { op, status: res.status, reason, latency_ms: latency, attempt });
        if (res.status >= 500 && attempt === 0) {
          await sleep(250 + Math.random() * 500);
          continue;
        }
        return { ok: false, failure: mapCivicError(res.status, reason, message), httpStatus: res.status, reason };
      } catch (e) {
        const name = e instanceof Error ? e.name : "unknown";
        logEvent("civic.network_error", { op, error: name, attempt });
        if (attempt === 0) {
          await sleep(250 + Math.random() * 500);
          continue;
        }
        return { ok: false, failure: "PROVIDER_ERROR", reason: name };
      }
    }
    return { ok: false, failure: "PROVIDER_ERROR", reason: "exhausted" };
  }
}

/**
 * Map a Google error to a resolution status. Upstream reason strings are not
 * fully documented; unknown combinations fall to PROVIDER_ERROR (never to
 * an empty ballot). Confirmed/expanded during live QA.
 */
export function mapCivicError(httpStatus: number, reason?: string, message?: string): CivicFailure {
  const r = (reason ?? "").toLowerCase();
  const m = (message ?? "").toLowerCase();
  if (httpStatus === 429 || /ratelimit|quota|dailylimit|resource_exhausted/.test(r)) return "RATE_LIMITED";
  if (httpStatus === 403 && /ratelimit|quota|limit/.test(r + m)) return "RATE_LIMITED";
  if (httpStatus >= 500) return "PROVIDER_ERROR";
  if (/multiple|ambiguous/.test(m)) return "AMBIGUOUS_ADDRESS";
  if (/election/.test(m) && /unknown|not found|invalid/.test(m)) return "ELECTION_NOT_FOUND";
  if (r === "parseerror" || /failed to parse|invalid address|unable to (geocode|locate)|could not (parse|geocode)/.test(m)) {
    return "INVALID_ADDRESS";
  }
  if (httpStatus === 404 || r === "notfound") return "NO_COVERAGE";
  if (httpStatus === 400) return "INVALID_ADDRESS";
  return "PROVIDER_ERROR";
}

export function parseMaxAge(header: string | null): number | undefined {
  if (!header) return undefined;
  if (/no-store|no-cache/i.test(header)) return 0;
  const m = /max-age=(\d+)/i.exec(header);
  return m ? Number(m[1]) : undefined;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
