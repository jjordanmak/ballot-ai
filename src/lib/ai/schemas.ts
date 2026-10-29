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

/** Superseded by PersonFacts + PersonBio (2026-10-29); kept for reading older stored runs. */
export const PersonResearch = z.object({
  currentRole: maybe.describe("The person's current job or office."),
  background: z.array(Answer).describe("Up to 3 facts about education and career."),
  pastPositions: z.array(Position).describe("Up to 5 past positions."),
  priorities: z.array(Answer).describe("Up to 5 priorities the person states, attributed to them ('Says they will…'). Empty for judges."),
});
export type PersonResearch = z.infer<typeof PersonResearch>;

const quoted = {
  quote: z.string().describe("The exact sentence(s) from one document that state this, copied character for character."),
  sourceId: z.string().describe("The id of that document, e.g. D1."),
};

/**
 * Stage 1 for people (owner, 2026-10-29): facts only, as fields. Code checks
 * each name and year against its quote and writes every line itself, so the
 * same facts read the same whichever model found them.
 */
export const EducationFact = z.object({
  degree: z.string().describe("The degree or credential exactly as the document names it, e.g. 'Juris Doctor', 'B.A.'."),
  field: z.string().nullable().describe("Field of study if stated, e.g. 'Economics'."),
  institution: z.string().describe("The school, as the document names it."),
  year: z.number().int().nullable().describe("Year completed, only if stated."),
  ...quoted,
});
export type EducationFact = z.infer<typeof EducationFact>;

export const POSITION_TYPES = ["elected", "appointed", "job", "board", "military", "nonprofit", "advisory"] as const;

export const PositionFact = z.object({
  title: z.string().describe("The title as the document states it, e.g. 'Deputy Attorney General', 'Chair, Committee on Budget'."),
  organization: z.string().nullable().describe("The body, agency, company or unit."),
  district: z.string().nullable().describe("District or seat if stated, e.g. '59th Assembly District'."),
  startYear: z.number().int().nullable(),
  endYear: z.string().nullable().describe("The year it ended (e.g. '1990'), 'present' if the document says they hold it now, or null if not stated."),
  type: z.enum(POSITION_TYPES),
  committees: z.array(z.string()).describe("Committees they were a plain member of while in this office (not chair or vice-chair; those are their own positions)."),
  ...quoted,
});
export type PositionFact = z.infer<typeof PositionFact>;

export const PersonFacts = z.object({
  education: z.array(EducationFact),
  positions: z.array(PositionFact),
  platform: z.array(Answer).describe("3 to 5 priorities in the person's own words from their statement, campaign site or Ballotpedia campaign themes, each attributed ('Says they will…'). Empty for judges."),
  residence: z
    .object({ place: z.string().describe("City or area only, never a street address."), ...quoted })
    .nullable()
    .describe("Where they live, only when asked for in the task and a document states it."),
  leftOut: z.array(z.object({ fact: z.string(), reason: z.string() })).describe("Up to 10 facts you found but did not include, and the rule that excluded each."),
});
export type PersonFacts = z.infer<typeof PersonFacts>;

/** Stage 2: a short neutral bio written only from the verified facts, each sentence naming the facts it uses. */
export const PersonBio = z.object({
  sentences: z
    .array(
      z.object({
        text: z.string(),
        facts: z.array(z.string()).describe("The ids of the facts this sentence uses, e.g. ['P2', 'E1']."),
      }),
    )
    .describe("3 to 5 sentences."),
});
export type PersonBio = z.infer<typeof PersonBio>;

/** The second pass: for each numbered claim, does its quote support it? */
export const SupportCheck = z.object({
  results: z.array(z.object({ n: z.number().int(), supported: z.boolean() })),
});

/** Same limits for every person, so profiles in one race have the same shape. */
export const CAPS = { background: 3, pastPositions: 5, priorities: 5, education: 8, positions: 25, platform: 5, bioSentences: 5, leftOut: 10, textChars: 300, quoteChars: 600 } as const;

export const OfficeResearch = z.object({
  duties: maybe.describe("What the office does: its main duties, in one or two sentences."),
  term: maybe.describe("Term length (e.g. four years) and any term limit."),
  seats: maybe.describe("How many seats or members the office or body has."),
  salary: maybe.describe("Salary, only if a document states it."),
});
export type OfficeResearch = z.infer<typeof OfficeResearch>;

export const OFFICE_FIELDS = ["duties", "term", "seats", "salary"] as const;
