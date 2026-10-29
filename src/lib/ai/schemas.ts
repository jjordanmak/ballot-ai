import { z } from "zod";

/**
 * What the model may return. Every answer carries the exact sentence it
 * relied on (`quote`) and the id of the document it came from; code then
 * checks the quote is really there. `null` means the documents don't say.
 * Caps are applied in code (CAPS), the same for every candidate in a race.
 */

export const Answer = z.object({
  text: z.string().describe("One or two short, plain sentences. No adjectives of judgment, no predictions, no advice."),
  quote: z.string().describe("The exact sentence(s) from the document that support the text, copied character for character."),
  sourceId: z.string().describe("The id of the document the quote is from, e.g. D1."),
});
export type Answer = z.infer<typeof Answer>;

const maybe = Answer.nullable();

export const MeasureResearch = z.object({
  summary: maybe.describe("What the measure would do."),
  yesMeans: maybe.describe("What a YES vote means."),
  noMeans: maybe.describe("What a NO vote means."),
  taxes: maybe.describe("Does it change taxes or fees, and for whom?"),
  cost: maybe.describe("What does it cost or save state or local government?"),
  money: maybe.describe("Where does the money go: how it can or must be used."),
  affected: maybe.describe("Who is directly affected."),
  currentLaw: maybe.describe("What the law is today."),
  kind: maybe.describe("What kind of change it is (constitutional amendment, statute, bond) and who put it on the ballot."),
});
export type MeasureResearch = z.infer<typeof MeasureResearch>;

export const MEASURE_FIELDS = ["summary", "yesMeans", "noMeans", "taxes", "cost", "money", "affected", "currentLaw", "kind"] as const;

const Position = z.object({
  title: z.string(),
  organization: z.string().nullable(),
  years: z.string().nullable(),
  quote: z.string(),
  sourceId: z.string(),
});
export type Position = z.infer<typeof Position>;

export const PersonResearch = z.object({
  currentRole: maybe.describe("The person's current job or office."),
  background: z.array(Answer).describe("Up to 3 facts about education and career."),
  pastPositions: z.array(Position).describe("Up to 5 past positions."),
  priorities: z.array(Answer).describe("Up to 5 priorities the person states, attributed to them ('Says they will…'). Empty for judges."),
});
export type PersonResearch = z.infer<typeof PersonResearch>;

/** The second pass: for each numbered claim, does its quote support it? */
export const SupportCheck = z.object({
  results: z.array(z.object({ n: z.number().int(), supported: z.boolean() })),
});

/** Same limits for every person, so profiles in one race have the same shape. */
export const CAPS = { background: 3, pastPositions: 5, priorities: 5, textChars: 300, quoteChars: 600 } as const;

export const OfficeResearch = z.object({
  duties: maybe.describe("What the office does: its main duties, in one or two sentences."),
  term: maybe.describe("Term length (e.g. four years) and any term limit."),
  seats: maybe.describe("How many seats or members the office or body has."),
  salary: maybe.describe("Salary, only if a document states it."),
});
export type OfficeResearch = z.infer<typeof OfficeResearch>;

export const OFFICE_FIELDS = ["duties", "term", "seats", "salary"] as const;
