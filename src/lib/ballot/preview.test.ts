import { describe, expect, it } from "vitest";
import { previewFields, previewSetting } from "./preview";

describe("?preview=<setting>", () => {
  it("is ignored in production", () => {
    expect(previewSetting("claude-haiku-5-5:medium:r1", "production")).toBeNull();
  });

  it("works on previews and locally, for well-formed settings only", () => {
    expect(previewSetting("claude-haiku-5-5:medium:r1", "preview")).toBe("claude-haiku-5-5:medium:r1");
    expect(previewSetting(["claude-sonnet-5-5:medium:r3"], undefined)).toBe("claude-sonnet-5-5:medium:r3");
    expect(previewSetting("1 Main St", "preview")).toBeNull();
    expect(previewSetting(undefined, "preview")).toBeNull();
  });

  it("reads each kind's held field for that setting", () => {
    expect(previewFields("claude-haiku-5-5:medium:r1")).toEqual([
      "measure@claude-haiku-5-5:medium:r1",
      "profile@claude-haiku-5-5:medium:r1",
      "office@claude-haiku-5-5:medium:r1",
      "race@claude-haiku-5-5:medium:r1",
    ]);
  });
});
