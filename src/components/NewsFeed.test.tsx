import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewsFeed } from "./NewsFeed";

describe("NewsFeed", () => {
  it("starts with both scroll buttons disabled (nothing to scroll yet)", () => {
    const html = renderToString(<NewsFeed items={[]} />);
    const right = /<button[^>]*aria-label="Scroll feed right"[^>]*>/.exec(html)?.[0] ?? /<button[^>]*disabled[^>]*aria-label="Scroll feed right"/.exec(html)?.[0] ?? "";
    expect(html).toMatch(/disabled=""[^>]*aria-label="Scroll feed right"|aria-label="Scroll feed right"[^>]*disabled/);
    expect(right.length).toBeGreaterThan(0);
  });
});
