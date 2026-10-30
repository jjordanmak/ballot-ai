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

/** Superseded (2026-10-29); kept for reading older stored runs. */
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

/*
 * Synthesis (WRITING_PIPELINE_PLAN.md, owner 2026-10-30): readable prose
 * written from several sources. Every sentence lists its sources and, for
 * each, a short excerpt copied from it; code checks each excerpt is really
 * there and every hard fact is in them, a verifier checks the meaning, and a
 * reviewer checks neutrality. The wording may paraphrase and combine.
 */
export const SynthRef = z.object({
  sourceId: z.string().describe("The id of the document, e.g. D2."),
  excerpt: z.string().describe("A short passage (a sentence or less) from that document that supports the sentence, copied character for character."),
});
export type SynthRef = z.infer<typeof SynthRef>;

const refs = z.array(SynthRef).describe("At least one source. Every number, date and name in the text must appear in these excerpts.");

export const SynthSentence = z.object({ text: z.string(), refs });
export type SynthSentence = z.infer<typeof SynthSentence>;

const sectionsOf = <T extends readonly [string, ...string[]]>(names: T) =>
  z.array(z.object({ section: z.enum(names), sentences: z.array(SynthSentence) })).describe("Each section once, in order. Leave a section's sentences empty when the documents don't support it.");

export const RACE_SECTIONS = ["context", "whyItMatters", "whatsAtStake", "bigPicture"] as const;
export type RaceSection = (typeof RACE_SECTIONS)[number];
export const RaceSynthesis = z.object({ sections: sectionsOf(RACE_SECTIONS) });
export type RaceSynthesis = z.infer<typeof RaceSynthesis>;

/** The measure's own fields (MEASURE_FIELDS), written as short prose; official sources only. */
export const MeasureSynthesis = z.object({ sections: sectionsOf(MEASURE_FIELDS) });
export type MeasureSynthesis = z.infer<typeof MeasureSynthesis>;

export const PERSON_SECTIONS = ["inBrief", "background", "priorities", "stances"] as const;
export type PersonSection = (typeof PERSON_SECTIONS)[number];

export const ENDORSEMENT_CATEGORIES = ["Elected Officials", "Unions", "Advocacy & Industry", "Local Leaders"] as const;

/**
 * People take 2 calls (2026-10-30): one combined schema was rejected by the
 * API as too large to compile. First the lists (the facts shape that
 * compiles), checked field by field; then the writing, given the checked
 * positions as P0, P1… for {{years:Pn}}. Both read the same cached documents.
 */
export const PersonLists = z.object({
  education: z.array(EducationFact),
  positions: z.array(PositionFact),
  residence: PersonFacts.shape.residence,
  leftOut: PersonFacts.shape.leftOut,
});
export type PersonLists = z.infer<typeof PersonLists>;

export const PersonWriting = z.object({
  sections: sectionsOf(PERSON_SECTIONS),
  mightFit: z
    .array(z.object({ issue: z.string().describe("The issue, in 1 to 3 words."), text: z.string(), refs }))
    .describe("Up to 4 lines, each a different issue."),
  timeline: z.array(z.object({ when: z.string().describe("A year, or a date like 'May 5, 2026'."), event: z.string(), refs })),
  endorsements: z.array(z.object({ name: z.string(), category: z.enum(ENDORSEMENT_CATEGORIES), refs })),
});
export type PersonWriting = z.infer<typeof PersonWriting>;

/** The repair pass and the parity rewrite: replacements for the listed units only. */
export const Rewrite = z.object({
  units: z.array(z.object({ id: z.string().describe("The id given, e.g. background.1."), text: z.string(), refs })),
});
export type Rewrite = z.infer<typeof Rewrite>;

/** The neutrality reviewer: only the units that break a rule. */
export const NeutralityReview = z.object({
  flags: z.array(z.object({ id: z.string(), reason: z.string().describe("Which rule, in a few words.") })),
});
export type NeutralityReview = z.infer<typeof NeutralityReview>;
