import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeprecatedBallotView, deprecatedBallot, deprecatedPagesEnabled } from "./JunePrimary";

describe("deprecated June 2026 primary", () => {
  it("is hidden in production and shown elsewhere", () => {
    expect(deprecatedPagesEnabled("production")).toBe(false);
    expect(deprecatedPagesEnabled("preview")).toBe(true);
    expect(deprecatedPagesEnabled(undefined)).toBe(true);
  });

  it("still renders every race from its frozen snapshot", () => {
    const ballot = deprecatedBallot("ca-2026-primary", "94015");
    expect(ballot?.races.length).toBe(17);
    const html = renderToString(<DeprecatedBallotView ballot={ballot!} />);
    expect(html).toContain("Deprecated · internal only");
    for (const race of ballot!.races) expect(html).toContain(`race-${race.id}`);
  });

  it("knows nothing else", () => {
    expect(deprecatedBallot("ca-2026-primary", "90210")).toBeNull();
    expect(deprecatedBallot("us-2026-11-03-general", "94015")).toBeNull();
  });
});
