import { describe, expect, it, vi } from "vitest";
import { isPrivateAddress, safeFetch } from "./safeFetch";

const publicDns = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;

describe("safeFetch", () => {
  it("recognizes private and loopback addresses", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.20.1.1", "192.168.1.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it("refuses private hosts, including after a redirect", async () => {
    await expect(safeFetch("http://169.254.169.254/latest", {}, { fetchImpl: vi.fn() as never, resolve: publicDns })).rejects.toThrow();
    await expect(safeFetch("http://localhost/x", {}, { fetchImpl: vi.fn() as never, resolve: publicDns })).rejects.toThrow();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://10.0.0.5/admin" } }));
    await expect(safeFetch("https://example.com/feed", {}, { fetchImpl: fetchImpl as never, resolve: publicDns })).rejects.toThrow();
  });
  it("follows public redirects and caps the body", async () => {
    const fetchImpl = vi.fn(async (u: string) =>
      u.endsWith("/old") ? new Response(null, { status: 301, headers: { location: "/new" } }) : new Response("x".repeat(1000)),
    );
    const r = await safeFetch("https://example.com/old", { maxBytes: 100 }, { fetchImpl: fetchImpl as never, resolve: publicDns });
    expect(r.finalUrl).toBe("https://example.com/new");
    expect(r.truncated).toBe(true);
    expect(r.text!.length).toBeLessThanOrEqual(100);
  });
});
