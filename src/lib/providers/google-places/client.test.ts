import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePlacesClient } from "./client";

const KEY = "AIzaTESTKEY000000000000000000000";
const TOKEN = "123e4567-e89b-42d3-a456-426614174000";
const TYPED = "742 Evergreen Ter";
const allow = async () => true;

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify(body), { status }));
}

afterEach(() => vi.restoreAllMocks());

describe("GooglePlacesClient", () => {
  it("requests US street addresses with the session token, key in a header, and never logs input or key", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const f = fakeFetch(200, {
      suggestions: [
        {
          placePrediction: {
            placeId: "ChIJabc123def456",
            text: { text: "742 Evergreen Terrace, Springfield, USA" },
            structuredFormat: { mainText: { text: "742 Evergreen Terrace" }, secondaryText: { text: "Springfield, USA" } },
          },
        },
        { queryPrediction: { text: { text: "ignored" } } },
      ],
    });
    const out = await new GooglePlacesClient({ apiKey: KEY, fetchImpl: f as unknown as typeof fetch, consume: allow }).suggest(TYPED, TOKEN);

    expect(out).toEqual([{ placeId: "ChIJabc123def456", main: "742 Evergreen Terrace", secondary: "Springfield, USA" }]);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(String(url)).not.toContain(KEY);
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const sent = JSON.parse(String(init!.body));
    expect(sent).toMatchObject({ input: TYPED, sessionToken: TOKEN, includedRegionCodes: ["us"] });
    const logged = log.mock.calls.flat().join("\n");
    expect(logged).not.toContain("Evergreen");
    expect(logged).not.toContain(KEY);
  });

  it("fetches only the formatted address for a picked place, in the same session", async () => {
    const f = fakeFetch(200, { formattedAddress: "742 Evergreen Terrace, Springfield, OR 97477, USA" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    const out = await new GooglePlacesClient({ apiKey: KEY, fetchImpl: f as unknown as typeof fetch, consume: allow }).address("ChIJabc123def456", TOKEN);
    expect(out).toBe("742 Evergreen Terrace, Springfield, OR 97477, USA");
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe(`https://places.googleapis.com/v1/places/ChIJabc123def456?sessionToken=${TOKEN}`);
    expect((init!.headers as Record<string, string>)["x-goog-fieldmask"]).toBe("formattedAddress");
  });

  it("returns nothing (never throws) when unconfigured, on errors, or on network failure", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await new GooglePlacesClient({ apiKey: "" }).suggest(TYPED, TOKEN)).toEqual([]);
    const denied = fakeFetch(403, { error: { status: "PERMISSION_DENIED" } });
    expect(await new GooglePlacesClient({ apiKey: KEY, fetchImpl: denied as unknown as typeof fetch, consume: allow }).suggest(TYPED, TOKEN)).toEqual([]);
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await new GooglePlacesClient({ apiKey: KEY, fetchImpl: down as unknown as typeof fetch, consume: allow }).address("ChIJabc123def456", TOKEN)).toBeUndefined();
  });

  it("never calls Google once the monthly budget is spent, and counts each call under its own metric", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = fakeFetch(200, { suggestions: [] });
    const asked: string[] = [];
    const client = new GooglePlacesClient({
      apiKey: KEY,
      fetchImpl: f as unknown as typeof fetch,
      consume: async (m) => (asked.push(m), false),
    });
    expect(await client.suggest(TYPED, TOKEN)).toEqual([]);
    expect(await client.address("ChIJabc123def456", TOKEN)).toBeUndefined();
    expect(f).not.toHaveBeenCalled();
    expect(asked).toEqual(["places.autocomplete", "places.details"]);
  });
});
