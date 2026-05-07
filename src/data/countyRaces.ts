import type { Race, Candidate } from "./types";

/**
 * SAN MATEO COUNTY RACES + JUDICIAL
 * ------------------------------------------------------------
 * All races in this file are nonpartisan — party affiliation does NOT
 * appear next to the candidate's name on the ballot. The "party" field
 * is set to "No Party Preference" so the data model still validates,
 * but the UI treats nonpartisan races as a special case where the party
 * pill is suppressed in favor of a "Nonpartisan" label.
 *
 * For SMC county officers, several incumbents are unopposed in 2026.
 * Where so, that race is marked unopposed and the comparison table
 * is hidden per the design.
 */

const TODO = (label: string) =>
  `<mark>RESEARCH PENDING</mark> — ${label}. This guide will be updated with sourced positions before election day.`;

const todoCandidate = (
  partial: Pick<Candidate, "id" | "name" | "currentRole"> & Partial<Candidate>
): Candidate => ({
  party: "No Party Preference",
  major: true,
  pollingStatus: "Polling pending",
  pastRoles: [],
  background: TODO("background"),
  priorities: [TODO("priorities")],
  stances: [TODO("stances")],
  strengths: [TODO("strengths")],
  criticisms: [TODO("criticisms")],
  history: [{ year: "TBD", event: TODO("timeline") }],
  endorsements: [{ category: "Elected Officials", name: TODO("endorsements") }],
  voteForIf: [TODO("voter-self-id")],
  bottomLine: TODO("summary"),
  issues: {},
  ...partial,
});

// ─────────────────────────────────────────────────────────────
// SAN MATEO COUNTY SUPERIOR COURT — Office No. 4
// ─────────────────────────────────────────────────────────────
export const judgeOffice4: Race = {
  id: "judge-office-4",
  office: "Judge of the Superior Court, Office No. 4",
  jurisdiction: "San Mateo County",
  format: "Nonpartisan Election",
  formatExplainer:
    "Officially nonpartisan. If a candidate wins more than 50% of the vote in the June primary, they win outright; otherwise the top two advance to November. Superior Court judges serve 6-year terms hearing felony, civil, family, juvenile, and probate cases.",
  meta: [
    { label: "Term", value: "6 years" },
    { label: "Salary", value: "$259,544 / yr (2026)" },
    { label: "Court", value: "San Mateo County Superior Court" },
  ],
  unopposed: false,
  intro: {
    context:
      "Judges of the San Mateo County Superior Court are elected to 6-year terms. Office No. 4 is one of approximately 30 SMC bench seats and is being contested in 2026. <mark>Most judicial seats in California go uncontested</mark> — when they are contested, voters are typically asked to choose between candidates with very different professional backgrounds (former prosecutors vs. defense attorneys vs. civil practitioners).",
    whyItMatters:
      "Superior Court judges hear the cases that most directly affect daily life in San Mateo County: <mark>felony criminal cases, civil disputes, family law, juvenile proceedings, restraining orders, and probate</mark>. The judge sets bail, decides custody, sentences after a felony conviction, rules on evictions, and adjudicates disputes between residents. Their judicial philosophy — on bail, sentencing, family law — is consequential.",
    bigPicture:
      "California's judicial elections are usually low-information races dominated by ballot designations (\"Deputy District Attorney,\" \"Civil Litigator,\" \"Family Law Attorney\"). The State Bar's <mark>Commission on Judicial Nominees Evaluation</mark> rates contested judicial candidates as Exceptionally Well Qualified, Well Qualified, Qualified, or Not Qualified — but those ratings are advisory, not binding.",
    whatsAtStake:
      "The judicial philosophy of one of San Mateo County's seats for the next 6 years. The makeup of the SMC bench more broadly. Bail and sentencing practices in felony cases that come before this judge.",
    polling:
      "Judicial races rarely attract polling. Voters typically rely on the Bar Association's qualification rating, ballot designation, and any newspaper endorsements.",
  },
  issues: [
    { id: "judicial-philosophy", label: "Judicial Philosophy" },
    { id: "criminal-sentencing", label: "Criminal Sentencing" },
    { id: "bail", label: "Bail & Pretrial Release" },
    { id: "family-law", label: "Family Law Approach" },
    { id: "experience", label: "Relevant Experience" },
    { id: "community-ties", label: "Community Ties" },
    { id: "bar-rating", label: "Bar Association Rating" },
  ],
  candidates: [
    todoCandidate({ id: "judge-4-a", name: "TBD Candidate A", currentRole: "TBD" }),
    todoCandidate({ id: "judge-4-b", name: "TBD Candidate B", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// COUNTY SUPERINTENDENT OF SCHOOLS
// ─────────────────────────────────────────────────────────────
export const countySupSchools: Race = {
  id: "county-sup-schools",
  office: "County Superintendent of Schools",
  jurisdiction: "San Mateo County",
  format: "Nonpartisan Election",
  formatExplainer:
    "Officially nonpartisan. If a candidate wins more than 50% in the June primary, they win outright; otherwise the top two advance to November. The County Superintendent leads the San Mateo County Office of Education (SMCOE).",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "Set by County Board of Education" },
    { label: "Vacancy", value: "Open seat (Magee retiring)" },
  ],
  unopposed: false,
  intro: {
    context:
      "Long-serving County Superintendent Nancy Magee is retiring, opening the office that runs the <mark>San Mateo County Office of Education (SMCOE)</mark> for the first time in nearly a decade. Two candidates have declared as of early 2026: Chelsea Bonini and Hector Camacho. The race is one of the most consequential local races on the SMC ballot.",
    whyItMatters:
      "The County Superintendent runs SMCOE — which serves <mark>approximately 95,000 students across 23 school districts</mark> in San Mateo County. The office provides specialized programs (special education, alternative education, juvenile court schools, foster youth services), oversees fiscal accountability of district budgets, and houses the Court & Community Schools serving SMC's most vulnerable kids.",
    bigPicture:
      "Post-pandemic learning loss, chronic absenteeism, the future of charter authorization, and federal Title IX/Title VI rollbacks under Trump 2.0 are all live in K-12 — and SMCOE is the level of government that translates those statewide and federal currents into local programs and budgets. Special education is also under unprecedented strain.",
    whatsAtStake:
      "Direction of SMCOE special education and alternative education programs. Fiscal oversight of struggling districts (several SMC districts face declining-enrollment budget pressure). The county-level posture on charter authorization. Foster-youth and juvenile-court schooling. Implementation of state curriculum mandates.",
    polling: "Local race; polling sparse. The contest is likely to be decided by school-board endorsements and the SMC teachers' union.",
  },
  issues: [
    { id: "learning-loss", label: "Learning Loss Recovery" },
    { id: "special-education", label: "Special Education" },
    { id: "fiscal-oversight", label: "Fiscal Oversight" },
    { id: "alt-education", label: "Alternative Education" },
    { id: "charter-policy", label: "Charter Policy" },
    { id: "absenteeism", label: "Chronic Absenteeism" },
    { id: "foster-youth", label: "Foster Youth Services" },
  ],
  candidates: [
    todoCandidate({
      id: "bonini",
      name: "Chelsea Bonini",
      currentRole: "Candidate; education advocate",
    }),
    todoCandidate({
      id: "camacho",
      name: "Hector Camacho Jr.",
      currentRole: "Candidate; school district administrator",
    }),
  ],
};

// ─────────────────────────────────────────────────────────────
// ASSESSOR-COUNTY CLERK-RECORDER
// ─────────────────────────────────────────────────────────────
export const acre: Race = {
  id: "acre",
  office: "Assessor-County Clerk-Recorder",
  jurisdiction: "San Mateo County",
  format: "Nonpartisan Election",
  formatExplainer:
    "Officially nonpartisan. If a candidate wins more than 50% in the June primary, they win outright; otherwise the top two advance to November. Combined office: the Assessor values all SMC property, the County Clerk-Recorder handles vital records and document recording, and the office also serves as the SMC Chief Elections Officer.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "Set by Board of Supervisors" },
    { label: "Incumbent", value: "Mark Church (D, NPP-elected)" },
  ],
  unopposed: false,
  intro: {
    context:
      "Mark Church, the long-serving SMC Assessor-County Clerk-Recorder & Chief Elections Officer, is seeking re-election. The office is uniquely consolidated in San Mateo County: the same elected official runs <mark>property tax assessment, vital records, document recording, and all county elections</mark>. This combination is unusual statewide and gives the role an outsized profile.",
    whyItMatters:
      "Property tax assessment is the largest source of revenue for SMC cities, schools, and special districts — collectively <mark>over $4B in property tax billed annually</mark>. The Clerk-Recorder houses every birth, death, marriage, and property record. And the Chief Elections Officer runs every SMC election — which means they are the front line for federal pressure on election administration in the Trump 2.0 era.",
    bigPicture:
      "Three roles in one office: assessment fairness in a market where home values have appreciated dramatically (and Prop 13 caps assessment growth at 2% annually for unsold properties); records modernization (paper-based filings still common); and election administration in an era of federal scrutiny. Each is consequential separately.",
    whatsAtStake:
      "Assessment fairness in a county where the median home is over $1.5M. Speed of property reassessment after sale or improvement. Modernization of the recording office. <mark>Election administration policy in the face of federal pressure</mark>: voter file maintenance, ballot tracking, drop-box access, vote-by-mail rules.",
    polling: "Incumbent advantage strong. Local races of this kind rarely poll.",
  },
  issues: [
    { id: "assessment-fairness", label: "Assessment Fairness" },
    { id: "records-modernization", label: "Records Modernization" },
    { id: "election-admin", label: "Election Administration" },
    { id: "voter-access", label: "Voter Access" },
    { id: "election-security", label: "Election Security" },
    { id: "transparency", label: "Office Transparency" },
  ],
  candidates: [
    todoCandidate({
      id: "church",
      name: "Mark Church",
      currentRole: "SMC Assessor-County Clerk-Recorder & Chief Elections Officer (incumbent)",
      pastRoles: ["SMC Assessor-County Clerk-Recorder & Chief Elections Officer (since 2011)"],
    }),
    todoCandidate({ id: "acre-2", name: "TBD Challenger", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// COUNTY CONTROLLER
// ─────────────────────────────────────────────────────────────
export const countyController: Race = {
  id: "county-controller",
  office: "County Controller",
  jurisdiction: "San Mateo County",
  format: "Nonpartisan Election",
  formatExplainer:
    "Officially nonpartisan. If a candidate wins more than 50% in the June primary, they win outright; otherwise the top two advance to November. The County Controller is SMC's chief accounting officer, separate from the County Treasurer-Tax Collector.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "Set by Board of Supervisors" },
    { label: "Incumbent", value: "Juan Raigoza (CPA, incumbent)" },
  ],
  unopposed: false,
  intro: {
    context:
      "Controller Juan Raigoza, a CPA who has held the office since 2014, is seeking re-election. The County Controller is SMC's <mark>independent fiscal officer</mark> — separate from the Board of Supervisors and the County Manager — responsible for accounting integrity across all county departments and districts.",
    whyItMatters:
      "The County Controller approves and audits SMC's payroll, accounts payable, and grant accounting. They produce the SMC Comprehensive Annual Financial Report (ACFR), monitor compliance with state and federal funding requirements, and serve on the <mark>SMC Retirement Board (SamCERA)</mark> overseeing public-employee pensions.",
    bigPicture:
      "Post-pandemic federal stimulus is winding down, declining school enrollment is squeezing district budgets, and SMC's structurally high cost of living means county hiring and retention is increasingly difficult. The Controller's audit posture and fiscal-policy guidance to the Board of Supervisors matter at the margins.",
    whatsAtStake:
      "Audit independence and aggressiveness. Pension oversight via the SamCERA board. Federal grant compliance — especially as Trump 2.0 audits and claws back state and county funding. Internal controls and fraud prevention.",
    polling: "Local race; polling sparse. Incumbent CPAs running for re-election typically face minimal opposition.",
  },
  issues: [
    { id: "audit-independence", label: "Audit Independence" },
    { id: "pension-oversight", label: "Pension Oversight" },
    { id: "fraud-prevention", label: "Fraud Prevention" },
    { id: "federal-funds", label: "Federal Funds Compliance" },
    { id: "transparency", label: "Budget Transparency" },
  ],
  candidates: [
    todoCandidate({
      id: "raigoza",
      name: "Juan Raigoza",
      currentRole: "SMC County Controller (incumbent, CPA)",
      pastRoles: ["Deputy Controller, San Mateo County", "Senior auditor, public accounting"],
    }),
    todoCandidate({ id: "controller-2", name: "TBD Challenger", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// CORONER (now combined with Sheriff in many CA counties; SMC keeps it separate)
// ─────────────────────────────────────────────────────────────
export const coroner: Race = {
  id: "coroner",
  office: "Coroner",
  jurisdiction: "San Mateo County",
  format: "Nonpartisan Election",
  formatExplainer:
    "Officially nonpartisan. If a candidate wins more than 50% in the June primary, they win outright; otherwise the top two advance to November. San Mateo County is one of the few California counties that still elects a Coroner separately from the Sheriff — the office maintains medical-examiner-style independence.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "Set by Board of Supervisors" },
    { label: "Incumbent", value: "Robert Foucrault (incumbent)" },
  ],
  unopposed: false,
  intro: {
    context:
      "Coroner Robert Foucrault has held the office for over two decades and is broadly respected statewide for running a <mark>medical-examiner-style independent office</mark>. SMC is one of fewer than 10 California counties that still elects a Coroner separately from the Sheriff — most counties have consolidated the office into a Sheriff-Coroner role, which civil-rights advocates argue creates a conflict of interest in officer-involved death investigations.",
    whyItMatters:
      "The Coroner determines cause and manner of death in every unattended, suspicious, or violent death in SMC — including <mark>officer-involved shootings, jail deaths, and overdoses</mark>. The office's independence from the Sheriff is structurally significant: the Coroner can rule a death a homicide independent of any law enforcement narrative.",
    bigPicture:
      "Officer-involved death investigations have driven national debate over whether elected Coroners should be combined with elected Sheriffs. Foucrault has been a vocal advocate of keeping them separate, and SMC has maintained that structure even as neighboring counties have consolidated.",
    whatsAtStake:
      "Independence of death investigations from law enforcement. Coroner office capacity and accreditation. Public-records access on cause-of-death determinations. The future structure of the office (whether SMC eventually consolidates with the Sheriff).",
    polling: "Local race; rarely polled. Incumbent Coroners with no scandal typically face minimal opposition.",
  },
  issues: [
    { id: "investigative-independence", label: "Investigative Independence" },
    { id: "officer-involved-deaths", label: "Officer-Involved Death Cases" },
    { id: "office-capacity", label: "Office Capacity & Accreditation" },
    { id: "transparency", label: "Records Transparency" },
    { id: "future-structure", label: "Future of the Office" },
  ],
  candidates: [
    todoCandidate({
      id: "foucrault",
      name: "Robert Foucrault",
      currentRole: "SMC Coroner (incumbent)",
      pastRoles: ["SMC Coroner (since 2003)", "Investigator, SMC Coroner's Office"],
    }),
    todoCandidate({ id: "coroner-2", name: "TBD Challenger", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// TREASURER-TAX COLLECTOR
// ─────────────────────────────────────────────────────────────
export const treasurerTaxCollector: Race = {
  id: "treasurer-tax-collector",
  office: "Treasurer-Tax Collector",
  jurisdiction: "San Mateo County",
  format: "Nonpartisan Election",
  formatExplainer:
    "Officially nonpartisan. If a candidate wins more than 50% in the June primary, they win outright; otherwise the top two advance to November. The Treasurer-Tax Collector collects all SMC property taxes and manages the county investment pool.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "Set by Board of Supervisors" },
    { label: "Incumbent", value: "Sandie Arnott (incumbent)" },
  ],
  unopposed: false,
  intro: {
    context:
      "Treasurer-Tax Collector Sandie Arnott, who has held the office since 2011, is seeking re-election. The office collects all property taxes within SMC and manages the <mark>SMC investment pool</mark> — over $5 billion in pooled funds belonging to the county, schools, special districts, and cities.",
    whyItMatters:
      "Every SMC property owner pays their tax bill to this office. The investment pool's performance affects <mark>school district reserves, city general funds, and special district operations</mark> across the county. The office also handles property tax delinquency, defaulted property auctions, and unclaimed funds.",
    bigPicture:
      "Rising interest rates have changed county-pool investment math significantly: the SMC pool's yield has risen sharply since 2022. At the same time, federal pressure on state and local funding (clawbacks, conditional grants) is reshaping how counties manage cash. Modernization of property tax collection (online payments, language access, hardship deferral) is also a live issue.",
    whatsAtStake:
      "Investment pool strategy and yield. Property tax delinquency and hardship deferral practices. Online and language access for tax payments. Defaulted-property auction policy. Cash management in a federal-pressure era.",
    polling: "Local race; polling sparse. Incumbent advantage typical.",
  },
  issues: [
    { id: "investment-strategy", label: "Investment Strategy" },
    { id: "tax-collection", label: "Tax Collection" },
    { id: "delinquency", label: "Delinquency & Hardship" },
    { id: "modernization", label: "Office Modernization" },
    { id: "transparency", label: "Investment Transparency" },
  ],
  candidates: [
    todoCandidate({
      id: "arnott",
      name: "Sandie Arnott",
      currentRole: "SMC Treasurer-Tax Collector (incumbent)",
      pastRoles: ["SMC Treasurer-Tax Collector (since 2011)", "SMC Deputy Treasurer-Tax Collector"],
    }),
    todoCandidate({ id: "ttc-2", name: "TBD Challenger", currentRole: "TBD" }),
  ],
};
