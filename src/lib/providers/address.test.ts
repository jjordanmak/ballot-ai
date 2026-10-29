import { describe, expect, it } from "vitest";
import { AddressInput } from "./address";

describe("AddressInput.hasLocality", () => {
  it.each([
    ["123 Main St, Daly City, CA 94015, USA", true],
    ["123 Main St, Daly City, CA", true],
    ["123 Main St, Daly City CA", true],
    ["123 Main St, Daly City, California", true],
    ["123 Main St Daly City CA 94015", true],
    ["12345 Main St, Austin, TX", true],
    ["123 Elm St, Springfield, IL 62701-1234", true],
    ["Main St & 1st Ave, Daly City, CA", true],
    ["1 Main St", false],
    ["1 Main St, Daly City", false],
    ["100 Main St, CA", false],
    ["123 Main St Daly City CA", false],
    ["12345 Main St", false],
  ])("%j → %s", (raw, ok) => expect(AddressInput.parse(raw)!.hasLocality()).toBe(ok));
});
