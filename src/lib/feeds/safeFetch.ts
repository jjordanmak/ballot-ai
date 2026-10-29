/**
 * Outbound fetch for collectors: public http(s) hosts only (no loopback,
 * private or link-local addresses, checked on every redirect hop), and a cap
 * on how much of the body is read. Feeds and campaign sites are third-party
 * URLs, so the server must not be steerable into its own network or into
 * reading an unbounded response.
 */
import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;
export const DEFAULT_MAX_BYTES = 5_000_000;

export type Resolver = typeof lookup;

export class BlockedUrlError extends Error {
  name = "BlockedUrlError";
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublic(url: URL, resolve: typeof lookup) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new BlockedUrlError("scheme");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.(local|internal|localhost))$/i.test(host)) throw new BlockedUrlError("host");
  const addrs = isIP(host) ? [{ address: host }] : await resolve(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new BlockedUrlError("address");
}

/** Read at most `maxBytes` of a body as text; longer bodies are cut off (`truncated`). */
async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; bytes: Uint8Array; truncated: boolean }> {
  if (!res.body) return { text: "", bytes: new Uint8Array(), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(Buffer.concat(chunks));
  return { text: new TextDecoder().decode(bytes), bytes, truncated };
}

export interface SafeResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  /** Undefined for HEAD requests and non-OK responses. */
  text?: string;
  /** The raw body (same bytes as `text`), for binary formats such as PDF. */
  bytes?: Uint8Array;
  truncated: boolean;
  finalUrl: string;
}

export async function safeFetch(
  url: string,
  init: RequestInit & { maxBytes?: number } = {},
  deps: { fetchImpl?: typeof fetch; resolve?: Resolver } = {},
): Promise<SafeResponse> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolve = deps.resolve ?? lookup;
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(current, resolve);
    const res = await fetchImpl(current.toString(), { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    const wantBody = res.ok && (init.method ?? "GET").toUpperCase() !== "HEAD";
    const body = wantBody ? await readCapped(res, init.maxBytes ?? DEFAULT_MAX_BYTES) : { text: undefined, bytes: undefined, truncated: false };
    return { status: res.status, ok: res.ok, headers: res.headers, text: body.text, bytes: body.bytes, truncated: body.truncated, finalUrl: current.toString() };
  }
  throw new BlockedUrlError("too many redirects");
}
