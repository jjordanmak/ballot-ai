import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Candidate } from "@/data/types";
import { CandidateProfile } from "./CandidateProfile";

const docs = {
  sos: { title: "Certified List of Candidates", publisher: "Secretary of State", url: "https://example.org/sos", official: true, accessed: "2026-10-28" },
  county: { title: "Roster of Candidates", publisher: "County Elections", url: "https://example.org/county", official: true, accessed: "2026-10-28" },
};
const candidate = {
  id: "a",
  name: "Avery Sample",
  party: "Democratic",
  major: true,
  pollingStatus: "",
  currentRole: "State Senator",
  pastRoles: [],
  background: "",
  priorities: [],
  stances: [],
  strengths: [],
  criticisms: [],
  history: [],
  endorsements: [],
  voteForIf: [],
  bottomLine: "",
  issues: {},
  general: {
    sourceDocs: docs,
    currentRole: { text: "State Senator", sources: ["county"] },
    ballotDesignation: { text: "State Senator/Attorney", sources: ["sos"] },
    links: [{ kind: "campaign", url: "https://example.org", sources: ["county"] }],
  },
} as unknown as Candidate;

const text = (html: string) => html.replace(/<!-- -->/g, "");

describe("CandidateProfile header", () => {
  // React #418: a <button> inside the header <button> makes the HTML parser
  // close the header early, so the server HTML no longer matches React's tree.
  it("keeps [n] markers and links out of the expand/collapse button", () => {
    const html = text(renderToString(<CandidateProfile candidate={candidate} raceId="r" />));
    const start = html.lastIndexOf("<button", html.indexOf("aria-expanded"));
    const header = html.slice(start + 1, html.indexOf("</button>", start));
    expect(header).toContain("Avery Sample");
    expect(header).not.toContain("<button");
    expect(header).not.toContain("<a ");
  });

  it("shows the cited role, ballot designation and links in the body; links carry no marker", () => {
    const html = text(renderToString(<CandidateProfile candidate={candidate} raceId="r" />));
    const body = html.slice(html.indexOf("</button>", html.indexOf("aria-expanded")));
    expect(body).toContain("Ballot designation: <span");
    expect(body).toContain("State Senator/Attorney");
    expect(body).toContain('aria-label="Source 1: Secretary of State"');
    expect(body).toContain('aria-label="Source 2: County Elections"');
    const links = body.slice(body.indexOf("Campaign website"), body.indexOf("Campaign website") + 600);
    expect(links).not.toContain("aria-label=\"Source");
  });

  it("doesn't repeat a role that matches the ballot designation", () => {
    const same = { ...candidate, currentRole: "Attorney", general: { ...candidate.general!, currentRole: { text: "Attorney", sources: ["county"] }, ballotDesignation: { text: "attorney", sources: ["sos"] } } } as Candidate;
    const html = text(renderToString(<CandidateProfile candidate={same} raceId="r" />));
    expect(html.match(/>Attorney</gi) ?? []).toHaveLength(1);
  });
});
