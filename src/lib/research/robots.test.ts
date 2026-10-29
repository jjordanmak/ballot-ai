import { describe, expect, it } from "vitest";
import { robotsAllows } from "./robots";

describe("robotsAllows", () => {
  it("allows everything when there's no file", () => {
    expect(robotsAllows(null, "https://a.gov/x")).toBe(true);
    expect(robotsAllows("", "https://a.gov/x")).toBe(true);
  });

  it("follows the longest matching rule; Allow wins a tie", () => {
    const txt = "User-agent: *\nDisallow: /elections/\nAllow: /elections/2026/\nDisallow: /*.pdf$";
    expect(robotsAllows(txt, "https://a.gov/elections/2024/x")).toBe(false);
    expect(robotsAllows(txt, "https://a.gov/elections/2026/guide")).toBe(true);
    expect(robotsAllows(txt, "https://a.gov/files/guide.pdf")).toBe(false);
    expect(robotsAllows(txt, "https://a.gov/files/guide.pdf?v=2")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /x\nAllow: /x", "https://a.gov/x")).toBe(true);
  });

  it("uses a group naming our agent instead of the * group", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: ballot.ai\nDisallow: /private/";
    expect(robotsAllows(txt, "https://a.gov/guide")).toBe(true);
    expect(robotsAllows(txt, "https://a.gov/private/x")).toBe(false);
    expect(robotsAllows("User-agent: OtherBot\nDisallow: /", "https://a.gov/guide")).toBe(true);
  });

  it("an empty Disallow allows everything", () => {
    expect(robotsAllows("User-agent: *\nDisallow:", "https://a.gov/x")).toBe(true);
  });
});
