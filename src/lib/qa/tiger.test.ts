import { describe, expect, it } from "vitest";
import { makeDbf, makeZip } from "./__fixtures__/tiger";
import { ADDRFEAT_FIELDS, countyAddresses, midNumber, parseCountyList, readDbf, readZipEntry } from "./tiger";

const ROWS = [
  { FULLNAME: "Sample Ave", LFROMHN: "101", LTOHN: "199", RFROMHN: "100", RTOHN: "198", ZIPL: "99901", ZIPR: "99901", ROAD_MTFCC: "S1400" },
  { FULLNAME: "Example St", LFROMHN: "1", LTOHN: "99", RFROMHN: "", RTOHN: "", ZIPL: "99901", ZIPR: "", ROAD_MTFCC: "S1400" },
  { FULLNAME: "Fictional Hwy", LFROMHN: "1000", LTOHN: "1998", RFROMHN: "", RTOHN: "", ZIPL: "99901", ZIPR: "", ROAD_MTFCC: "S1100" },
  { FULLNAME: "Other Rd", LFROMHN: "N12", LTOHN: "N98", RFROMHN: "", RTOHN: "", ZIPL: "99902", ZIPR: "", ROAD_MTFCC: "S1400" },
  { FULLNAME: "Lone Ln", LFROMHN: "2", LTOHN: "40", RFROMHN: "", RTOHN: "", ZIPL: "99902", ZIPR: "", ROAD_MTFCC: "S1400" },
];

describe("TIGER county addresses", () => {
  it("reads the county list for the 50 states and DC only", () => {
    const text = "STATE|STATEFP|COUNTYFP|COUNTYNS|COUNTYNAME|CLASSFP|FUNCSTAT\nTX|48|453|01384012|Travis County|H1|A\nPR|72|001|01804481|Adjuntas Municipio|H1|A\nDC|11|001|01702382|District of Columbia|H6|F\n";
    expect(parseCountyList(text)).toEqual([
      { state: "TX", fips: "48453", name: "Travis County" },
      { state: "DC", fips: "11001", name: "District of Columbia" },
    ]);
  });

  it("unzips the .dbf and reads only the fields it needs", () => {
    const zip = makeZip({ "tl_2024_99999_addrfeat.shp": new Uint8Array([1, 2, 3]), "tl_2024_99999_addrfeat.dbf": makeDbf(ADDRFEAT_FIELDS, ROWS) });
    const dbf = readZipEntry(zip, ".dbf")!;
    const rows = readDbf(dbf, ["FULLNAME", "ZIPL"]);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ FULLNAME: "Sample Ave", ZIPL: "99901" });
    expect(readZipEntry(zip, ".prj")).toBeNull();
  });

  it("takes the middle of a range on its own odd or even side", () => {
    expect(midNumber(101, 199)).toBe(151);
    expect(midNumber(100, 198)).toBe(150);
    expect(midNumber(198, 100)).toBe(150);
    expect(midNumber(1, 1)).toBe(1);
  });

  it("builds addresses on residential roads in the county's most common ZIP, never highways or lettered ranges", () => {
    const out = countyAddresses(ROWS, "TX");
    expect(out).toEqual(["51 Example St, TX 99901", "150 Sample Ave, TX 99901"]);
    expect(out.join(" ")).not.toMatch(/Hwy|Other Rd/);
    expect(countyAddresses([], "TX")).toEqual([]);
  });
});
