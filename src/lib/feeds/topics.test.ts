import { describe, expect, it } from "vitest";
import { NEWS_TOPICS, newsTopics } from "./topics";

describe("newsTopics", () => {
  it("tags a topic named in the headline", () => {
    expect(newsTopics("Governor candidates spar over housing costs")).toEqual(["Housing"]);
    expect(newsTopics("Ohio levy would raise property taxes for schools")).toEqual(["Taxes", "Education"]);
  });

  it("needs a topic twice in the excerpt when the headline doesn't name it", () => {
    expect(newsTopics("Candidates meet in Austin", "One question touched on traffic.")).toEqual([]);
    expect(newsTopics("Candidates meet in Austin", "They argued over traffic and the stalled transit plan.")).toEqual(["Transportation"]);
  });

  it("keeps at most two, strongest first, ties in list order", () => {
    const title = "Insurance, police and tuition dominate Georgia debate";
    expect(newsTopics(title)).toEqual(["Education", "Public safety"]);
    expect(newsTopics(title, "Insurers and insurance rates came up again.")).toEqual(["Insurance", "Education"]);
  });

  it("matches whole words only, and not the electoral college", () => {
    expect(newsTopics("Attaxa Corp backs ballot campaign")).toEqual([]);
    expect(newsTopics("What the electoral college means for Arizona")).toEqual([]);
    expect(newsTopics("Arizona college students register to vote")).toEqual(["Education"]);
  });

  it("covers everyday issues beyond politics", () => {
    expect(newsTopics("Medicaid cuts worry rural clinics")).toEqual(["Health care"]);
    expect(newsTopics("Candidates split on asylum rules")).toEqual(["Immigration"]);
    expect(newsTopics("Child care costs top parents' concerns")).toEqual(["Child care"]);
    expect(newsTopics("Utility bills climb as summer ends")).toEqual(["Energy"]);
    expect(newsTopics("Veterans group hosts forum")).toEqual(["Veterans"]);
  });

  it("skips idioms that only look like a topic", () => {
    expect(newsTopics("Campaign jumped the gun on its victory claim")).toEqual([]);
    expect(newsTopics("Gun laws on the ballot in Oregon")).toEqual(["Guns"]);
  });

  it("folds hyphens and case", () => {
    expect(newsTopics("HIGH-SPEED RAIL vote set")).toEqual(["Transportation"]);
  });

  it("uses only the fixed list", () => {
    const labels = new Set<string>(NEWS_TOPICS.map((t) => t.label));
    for (const t of newsTopics("Housing, taxes, crime, insurance, transit and schools")) expect(labels.has(t)).toBe(true);
  });
});
