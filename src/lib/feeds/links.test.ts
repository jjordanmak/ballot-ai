import { describe, expect, it } from "vitest";
import { findXProfile } from "./links";

describe("findXProfile", () => {
  it("returns the first profile link as an x.com URL", () => {
    expect(findXProfile('<a href="https://twitter.com/JaneForCA">X</a>')).toBe("https://x.com/JaneForCA");
    expect(findXProfile("<a href='https://www.x.com/@jane_doe?lang=en'>")).toBe("https://x.com/jane_doe");
  });
  it("skips share, intent and other non-profile links", () => {
    const html = '<a href="https://twitter.com/intent/tweet?text=hi"></a><a href="https://x.com/share?url=a"></a><a href="https://x.com/RealHandle/">';
    expect(findXProfile(html)).toBe("https://x.com/RealHandle");
  });
  it("finds nothing without a profile link", () => {
    expect(findXProfile('<a href="https://facebook.com/jane">')).toBeUndefined();
    expect(findXProfile("Follow us on X @jane")).toBeUndefined();
  });
});
