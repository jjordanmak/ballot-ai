import { describe, expect, it } from "vitest";
import { aiConfig, isSettingId, parseSetting, ROUND_CONFIG, settingId } from "./config";

describe("settings and writing rounds", () => {
  const base = { model: "claude-haiku-5-5", effort: "medium" as const };

  it("reads and writes model:effort:round, so each round's results are stored under their own tag", () => {
    expect(parseSetting("claude-haiku-5-5:medium:r2", base)).toEqual({ model: "claude-haiku-5-5", effort: "medium", round: "r2" });
    expect(settingId(parseSetting("claude-haiku-5-5:medium:r2", base))).toBe("claude-haiku-5-5:medium:r2");
    expect(settingId(parseSetting("claude-sonnet-5-5:low", base))).toBe("claude-sonnet-5-5:low");
    // Anything else after the effort is ignored, never stored.
    expect(parseSetting("claude-haiku-5-5:high:<script>", base)).toEqual({ model: "claude-haiku-5-5", effort: "high" });
  });

  it("compare mode runs the round file's settings unless AI_COMPARE overrides them", () => {
    expect(aiConfig({}).compare.map(settingId)).toEqual(ROUND_CONFIG.settings);
    expect(aiConfig({ AI_COMPARE: "claude-sonnet-5-5:low" }).compare.map(settingId)).toEqual(["claude-sonnet-5-5:low"]);
  });

  it("only well-formed setting ids are accepted from a URL", () => {
    expect(isSettingId("claude-haiku-5-5:medium:r1")).toBe(true);
    expect(isSettingId("claude-haiku-5-5:medium")).toBe(true);
    expect(isSettingId("claude-haiku-5-5:medium:r1'; drop")).toBe(false);
    expect(isSettingId("gpt:medium")).toBe(false);
  });

  it("the highlight off switch", () => {
    expect(aiConfig({}).highlights).toBe(true);
    expect(aiConfig({ AI_HIGHLIGHTS: "off" }).highlights).toBe(false);
  });
});
