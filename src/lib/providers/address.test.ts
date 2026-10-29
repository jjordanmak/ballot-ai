import { describe, expect, it } from "vitest";
import { AddressInput, startsLikeStreetAddress } from "./address";

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
    ["123 Main St Springfield, IL", true],
    ["100 Main St, Cambridge, MA,02139", true],
    ["1 Calle Luna, San Juan, Puerto Rico", true],
    ["2 Main St, Charlotte Amalie, VI 00802", true],
    ["1234 E 10600 S", false],
    ["1234 W 12600 S, Riverton", false],
    ["PO Box 12345", false],
  ])("%j → %s", (raw, ok) => expect(AddressInput.parse(raw)!.hasLocality()).toBe(ok));
});

describe("startsLikeStreetAddress", () => {
  it.each([
    ["123 Main St", true],
    ["N1234 County Rd K, Lomira, WI", true],
    ["One Main St, Boston, MA", true],
    ["Urb Las Lomas, Calle 5, San Juan, PR", true],
    ["Carr 1 Km 2.3, Caguas, PR", true],
    ["Main St & 1st Ave, Daly City, CA", false],
    ["City Hall, Daly City, CA", false],
  ])("%j → %s", (raw, ok) => expect(startsLikeStreetAddress(raw)).toBe(ok));
});
