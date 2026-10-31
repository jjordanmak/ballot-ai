import { describe, expect, it, vi } from "vitest";
import { checkAbout, quoteAboutThem } from "./about";

const STORY = [
  "The state's rail authority chief resigned Wednesday before a key board vote.",
  "Xavier Becerra, the Democratic candidate for governor, toured the Fresno station on Thursday. He said the line must be finished.",
  "A former governor once called the project a priority.",
].join("\n");
const v = ["xavier becerra"];

describe("AI person check", () => {
  it("accepts a quote only when it's in the story word for word and about the person", () => {
    expect(quoteAboutThem("Xavier Becerra, the Democratic candidate for governor, toured the Fresno station on Thursday.", STORY, v, "becerra")).toBe(true);
    // A pronoun sentence right after one that names them.
    expect(quoteAboutThem("He said the line must be finished.", STORY, v, "becerra")).toBe(true);
    // Not in the story, or in it but about someone else.
    expect(quoteAboutThem("Becerra said he would cancel the project entirely.", STORY, v, "becerra")).toBe(false);
    expect(quoteAboutThem("The state's rail authority chief resigned Wednesday before a key board vote.", STORY, v, "becerra")).toBe(false);
  });

  it("asks about one named candidate with the article as the document, and checks the answer in code", async () => {
    const usage = { input_tokens: 4_000, output_tokens: 100 };
    const parse = vi.fn(async () => ({ stop_reason: "end_turn", usage, parsed_output: { about: true, quote: "Becerra promised to cancel the line." } }));
    const out = await checkAbout({ name: "Xavier Becerra", office: "Governor", title: "Rail chief resigns", url: "https://news.test/rail", article: STORY, variants: v, surname: "becerra", setting: { model: "claude-haiku-5-5", effort: "medium" }, client: { messages: { parse } } as never });
    // An invented quote never puts the candidate on, whatever the model says.
    expect(out).toMatchObject({ about: false, problem: "quote not found or not about them" });
    expect(out.costMicroUsd).toBeGreaterThan(0);
    const req = (parse.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0];
    expect(req.messages[0].content).toContain('<document id="A1" title="Rail chief resigns"');
    expect(req.messages[0].content).toContain("a candidate for Governor");
  });
});
