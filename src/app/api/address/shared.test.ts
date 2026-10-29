import { describe, expect, it } from "vitest";
import { sameSite } from "./_shared";

const req = (headers: Record<string, string>) => new Request("https://ballot-ai.vercel.app/api/address/suggest", { method: "POST", headers });

describe("sameSite", () => {
  it("accepts same-origin browser requests", () => {
    expect(sameSite(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(sameSite(req({ origin: "https://ballot-ai.vercel.app", host: "ballot-ai.vercel.app" }))).toBe(true);
  });
  it("refuses cross-site requests and requests with no browser origin at all", () => {
    expect(sameSite(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(sameSite(req({ origin: "https://evil.example", host: "ballot-ai.vercel.app" }))).toBe(false);
    expect(sameSite(req({}))).toBe(false);
  });
});
