import { describe, expect, it } from "vitest";
import { gkgLine } from "@/lib/qa/__fixtures__/gkg";
import { parseGkgRow, parseLastUpdate } from "./gdeltFiles";

describe("GDELT data files", () => {
  it("finds the GKG file in lastupdate.txt", () => {
    const text = [
      "150383 297a16b493de7cf6ca809a7cc31d0b93 http://data.gdeltproject.org/gdeltv2/20261030224500.export.CSV.zip",
      "318084 bb27f78ba45f69a17ea6ed7755e9f8ff http://data.gdeltproject.org/gdeltv2/20261030224500.mentions.CSV.zip",
      "10768507 ea8dde0beb0ba98810a92db068c0ce99 http://data.gdeltproject.org/gdeltv2/20261030224500.gkg.csv.zip",
    ].join("\n");
    expect(parseLastUpdate(text)).toEqual({ size: 10768507, url: "http://data.gdeltproject.org/gdeltv2/20261030224500.gkg.csv.zip" });
    expect(parseLastUpdate("garbage")).toBeNull();
  });

  it("reads a row's outlet, URL, people and title", () => {
    const row = parseGkgRow(gkgLine({ domain: "Example.com", url: "https://example.com/a", persons: "Jane Sample;jane sample;Sam Doe", title: "Sample &amp; Doe debate in Texas" }));
    expect(row).toEqual({ domain: "example.com", url: "https://example.com/a", date: "20261030224500", persons: ["jane sample", "sam doe"], title: "Sample & Doe debate in Texas" });
  });

  it("skips short or URL-less rows", () => {
    expect(parseGkgRow("a\tb\tc")).toBeNull();
    expect(parseGkgRow(gkgLine({ domain: "x", url: "not a url" }))).toBeNull();
  });
});
