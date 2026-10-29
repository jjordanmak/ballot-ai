import { describe, expect, it } from "vitest";
import { readyToSuggest } from "./ready";

describe("readyToSuggest", () => {
  it.each([
    ["123 Mai", true],
    ["12-34 Mai", true],
    ["123 N 1st", true],
    ["123 Main St, Daly", true],
    ["Main Street", true],
    ["123", false],
    ["12345", false],
    ["123 Ma", false],
    ["1 Ma", false],
    ["Main St", false],
    ["   ", false],
  ])("%j → %s", (input, ready) => expect(readyToSuggest(input)).toBe(ready));
});
