import type { Race } from "./types";
import { governor } from "./governor";
import {
  ltGovernor,
  secOfState,
  controller,
  treasurer,
  attorneyGeneral,
  insuranceCommissioner,
  supPublicInstruction,
  boe2,
  ca15,
  ad19,
} from "./scaffolds";
import {
  judgeOffice4,
  countySupSchools,
  acre,
  countyController,
  coroner,
  treasurerTaxCollector,
} from "./countyRaces";

/**
 * Race order matches the requested ballot order:
 *   Statewide constitutional offices → BOE → US Congress → State Assembly →
 *   Judicial → Sup of Public Instruction → County offices.
 */
export const races: Race[] = [
  governor,
  ltGovernor,
  secOfState,
  controller,
  treasurer,
  attorneyGeneral,
  insuranceCommissioner,
  boe2,
  ca15,
  ad19,
  judgeOffice4,
  supPublicInstruction,
  countySupSchools,
  acre,
  countyController,
  coroner,
  treasurerTaxCollector,
];

export const ABOUT_GUIDE = {
  intro:
    "This guide compiles candidate positions, polling, and race context from verified public sources. The Governor race is fully built out as a v1; the remaining downballot races are <mark>scaffolded with incumbent and structural information</mark> and will be expanded with full candidate research before election day, June 2, 2026.",
  sources: [
    {
      name: "CalMatters Voter Guide 2026",
      role: "Primary editorial source for candidate positions across statewide races.",
      url: "https://calmatters.org/california-voter-guide-2026/",
    },
    {
      name: "Ballotpedia — California 2026 elections",
      role: "Authoritative source for declared candidates, ballot order, and race history.",
      url: "https://ballotpedia.org/California_gubernatorial_election,_2026",
    },
    {
      name: "California Secretary of State — Election Information",
      role: "Official ballot, polling place, and candidate filing information.",
      url: "https://www.sos.ca.gov/elections",
    },
    {
      name: "Berkeley IGS Poll",
      role: "Independent academic polling for California statewide races.",
      url: "https://igs.berkeley.edu/research/berkeley-igs-poll",
    },
    {
      name: "Emerson College Polling / Inside California Politics",
      role: "Recurring tracking polls of the California governor primary.",
      url: "https://emersoncollegepolling.com/",
    },
    {
      name: "Race to the WH — California 2026 polling average",
      role: "Aggregator of public polling for the governor's race.",
      url: "https://www.racetothewh.com/governor/california26",
    },
    {
      name: "KPBS Public Media — 2026 Primary Election explainer",
      role: "Detailed candidate-by-candidate explainer of the governor's race (May 4, 2026).",
      url: "https://www.kpbs.org/news/politics/2026/05/04/2026-primary-election-california-governor-race-explainer",
    },
    {
      name: "CNN Politics — May 5, 2026 California governor debate coverage",
      role: "Source for May 5 debate quotes, clashes, and candidate positions.",
      url: "https://www.cnn.com/2026/05/05/politics/takeaways-cnn-california-governor-debate",
    },
    {
      name: "The Hollywood Reporter — debate coverage",
      role: "Hollywood-tax-credit and entertainment-industry coverage of the May 5 debate.",
      url: "https://www.hollywoodreporter.com/news/politics-news/california-governor-debate-cnn-candidates-highlights-1236587607/",
    },
    {
      name: "Washington Post — Swalwell allegations reporting",
      role: "Source for Eric Swalwell's withdrawal under sexual misconduct allegations.",
      url: "https://www.washingtonpost.com/politics/2026/04/10/eric-swalwell-sexual-assault-allegations/",
    },
    {
      name: "CNN — Inside the sudden downfall of Eric Swalwell",
      role: "Source for the timeline of endorsement withdrawals and campaign collapse.",
      url: "https://www.cnn.com/2026/04/15/politics/eric-swalwell-allegations-congress-downfall",
    },
    {
      name: "Individual campaign websites",
      role: "Primary source for candidate priorities, biographical information, and policy detail.",
    },
  ],
  methodology:
    "Candidate positions are stated in the candidate's own framing where possible. Where a position is contested or evolving, this guide uses the most recent verifiable statement (debate, campaign site, or filed legislation). Highlighted phrases indicate the editorial-judged most consequential claim per row. <mark>This guide is a compilation, not an endorsement</mark> — your vote is yours.",
  lastUpdated: "May 6, 2026",
};
