import type { Race, Candidate } from "./types";

/**
 * SCAFFOLD RACES — full intros, candidate slots TODO
 * ------------------------------------------------------------
 * The Governor race in `governor.ts` has full source-grounded depth.
 * The races below have:
 *  - Full intro depth matching Governor (context / why it matters /
 *    big picture / what's at stake / polling)
 *  - Real incumbents and known declared candidates
 *  - Issue rows tailored to each office
 *  - Each candidate marked TODO in priorities/stances/etc. — to be
 *    expanded with sourced positions in the next research pass.
 */

const TODO = (label: string) =>
  `<mark>RESEARCH PENDING</mark> — ${label}. This guide will be updated with sourced positions before election day.`;

const todoCandidate = (
  partial: Pick<Candidate, "id" | "name" | "party" | "currentRole"> & Partial<Candidate>
): Candidate => ({
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
// LIEUTENANT GOVERNOR
// ─────────────────────────────────────────────────────────────
export const ltGovernor: Race = {
  id: "lt-governor",
  office: "Lieutenant Governor",
  jurisdiction: "California Statewide",
  format: "Top-Two Open Primary",
  formatExplainer:
    "All candidates appear on a single ballot regardless of party. The two highest vote-getters advance to the November 3, 2026 general election — even if both are from the same party. The Lt. Governor is elected separately from the Governor (not on a joint ticket).",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "$165,288 / yr" },
    { label: "Vacancy", value: "Open seat (Kounalakis term-limited)" },
    { label: "Last winner", value: "Kounalakis 2022 — 60.0%" },
  ],
  unopposed: false,
  intro: {
    context:
      "Lt. Gov. Eleni Kounalakis is term-limited after two terms, opening the office for the first time since 2018. She is herself <mark>running for governor in this same primary</mark> — leaving California with simultaneously open Governor and Lt. Governor races. The position is historically a stepping stone (Newsom, Kounalakis, Bustamante, Davis all used it), and the 2026 field reflects that: state senators, constitutional officers, and former ambassadors are all treating Lt. Gov. as a launchpad to higher office.",
    whyItMatters:
      "The Lt. Governor casts <mark>tie-breaking votes in the State Senate</mark>, sits on the <mark>UC Board of Regents and the CSU Board of Trustees</mark>, chairs the State Lands Commission (oversight of $30B in state-owned coastal and tideland assets), and serves as Acting Governor any time the Governor leaves California. With UC and CSU under simultaneous pressure on tuition, free speech, and federal funding, the Regents/Trustees seat alone is the most consequential part of the job in 2026.",
    bigPicture:
      "California's Lt. Governorship is a low-profile office with quietly high-leverage seats — and the 2026 contest will play out in the shadow of the governor's race headlining the same ballot. Whoever wins inherits a UC system mid-budget-crisis, a CSU system in financial restructuring, and a State Lands Commission that must arbitrate offshore wind, LNG terminal proposals, and coastal climate adaptation.",
    whatsAtStake:
      "UC and CSU governance during a tuition and federal-funding turbulence cycle. State Lands Commission decisions on offshore wind, oil-and-gas leases, and coastal climate adaptation. State Senate tie-breaking votes when the chamber is closely divided. Line of succession to the governorship — every Lt. Governor since 1990 has eventually sought higher office.",
    polling:
      "Polling is sparse and largely undecided this far down the ballot. The race is expected to crystallize in the final two weeks as the governor's race resolves voter attention.",
  },
  issues: [
    { id: "uc-csu", label: "UC & CSU Governance" },
    { id: "tuition", label: "Tuition & Affordability" },
    { id: "free-speech", label: "Campus Free Speech" },
    { id: "state-lands", label: "State Lands & Coast" },
    { id: "economic-dev", label: "Economic Development" },
    { id: "broadband", label: "Broadband & Rural Equity" },
    { id: "trump", label: "Trump & Federal Relations" },
  ],
  candidates: [
    todoCandidate({ id: "ltgov-d-1", name: "TBD Major Democrat", party: "Democratic", currentRole: "Statewide elected officer" }),
    todoCandidate({ id: "ltgov-d-2", name: "TBD State Senator", party: "Democratic", currentRole: "California State Senator" }),
    todoCandidate({ id: "ltgov-r-1", name: "TBD Major Republican", party: "Republican", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// SECRETARY OF STATE
// ─────────────────────────────────────────────────────────────
export const secOfState: Race = {
  id: "secretary-of-state",
  office: "Secretary of State",
  jurisdiction: "California Statewide",
  format: "Top-Two Open Primary",
  formatExplainer:
    "Top two regardless of party advance to November. The Secretary of State runs California's elections, oversees campaign finance disclosure, and houses business and notary filings.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "$181,725 / yr" },
    { label: "Incumbent", value: "Shirley Weber (D), appointed 2021" },
    { label: "Last winner", value: "Weber 2022 — 59.6%" },
  ],
  unopposed: false,
  intro: {
    context:
      "Secretary Shirley Weber, appointed by Gov. Newsom in 2021 to succeed Alex Padilla and elected in her own right in 2022, is seeking another full term. She is the <mark>first Black Secretary of State in California history</mark> and built her national profile as the legislative author of California's reparations task force. Her 2026 campaign is unfolding under unprecedented federal pressure on state election infrastructure — Trump's Justice Department has signaled willingness to investigate state election systems, and California is on the front line.",
    whyItMatters:
      "California's Secretary of State runs the <mark>largest electoral system in the country</mark> — 22 million registered voters, 58 county elections offices, and a sprawling vote-by-mail operation. The office is also the front line of state defense against federal election interference, the gatekeeper for AI-generated political content disclosure, and the issuer of every California business filing.",
    bigPicture:
      "Election integrity and election accessibility are now actively contested in ways they weren't a decade ago. The Secretary of State sets policy on voter file maintenance, vote-by-mail signature verification, ballot tracking transparency, AI deepfake disclosure, and the office's posture toward a federal Justice Department actively probing state systems.",
    whatsAtStake:
      "Vote-by-mail rules and ballot drop-box access. Election security funding and cybersecurity standards. AI deepfake disclosure rules in political ads. The state's posture toward DOJ election-system investigations. Campaign finance disclosure aggressiveness. Business filing modernization (still partly paper-based).",
    polling: "Incumbent advantage is strong; downballot polling is sparse. Republican challengers focus on voter ID and SAVE-style citizenship verification.",
  },
  issues: [
    { id: "election-integrity", label: "Election Integrity" },
    { id: "voter-access", label: "Voter Access" },
    { id: "ai-deepfakes", label: "AI Deepfakes" },
    { id: "campaign-finance", label: "Campaign Finance" },
    { id: "business-filings", label: "Business Filings" },
    { id: "trump", label: "Federal Relations" },
  ],
  candidates: [
    todoCandidate({
      id: "weber",
      name: "Shirley N. Weber",
      party: "Democratic",
      currentRole: "California Secretary of State (incumbent, seeking re-election)",
      pastRoles: ["California State Assemblymember, 79th district (2012–2021)", "Professor, San Diego State University"],
    }),
    todoCandidate({ id: "sos-r", name: "TBD Republican Challenger", party: "Republican", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// CONTROLLER
// ─────────────────────────────────────────────────────────────
export const controller: Race = {
  id: "controller",
  office: "Controller",
  jurisdiction: "California Statewide",
  format: "Top-Two Open Primary",
  formatExplainer:
    "Top two regardless of party advance to November. The Controller is California's chief fiscal officer — independently auditing state agencies, signing every state warrant (check), and serving on dozens of state boards.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "$181,725 / yr" },
    { label: "Incumbent", value: "Malia Cohen (D), elected 2022" },
    { label: "Last winner", value: "Cohen 2022 — 53.0%" },
  ],
  unopposed: false,
  intro: {
    context:
      "Controller Malia Cohen, the former Chair of the State Board of Equalization and former San Francisco Supervisor, is seeking re-election as California faces a <mark>$30B+ structural budget shortfall</mark>, post-pandemic Medicaid unwinding, and renewed federal scrutiny of state spending. The office sits independently of the Governor and Legislature — its audit posture is one of the few real checks on executive-branch fiscal behavior.",
    whyItMatters:
      "The Controller signs every state warrant and audits how California's <mark>$300B+ budget</mark> is actually spent. The office is statutorily independent — it can refuse to issue payments it deems unconstitutional, and historically has. The Controller also sits on the boards of <mark>CalPERS and CalSTRS</mark> (combined $700B+ in pension assets), the State Lands Commission, the Franchise Tax Board, and dozens of other entities.",
    bigPicture:
      "Audit independence has become a national flashpoint. California's Controller is positioned to investigate state agency spending, claw back misallocated federal funds, and defend the state from federal funding clawbacks. Cohen's tenure has emphasized <mark>fraud and waste audits</mark> in EDD, DMV, and the homelessness apparatus.",
    whatsAtStake:
      "Audit priorities (which agencies get scrutinized, and how aggressively). Pension-fund investment guidance via CalPERS/CalSTRS board votes. Fraud investigation capacity. Federal funds posture — whether to comply quietly with federal clawback orders or contest them. Transparency of state spending data.",
    polling: "Incumbent advantage; downballot polling sparse. Republican challengers traditionally over-perform in this office relative to other statewide races.",
  },
  issues: [
    { id: "audit-independence", label: "Audit Independence" },
    { id: "fraud", label: "Fraud & Waste" },
    { id: "pension", label: "Pension Oversight" },
    { id: "budget-transparency", label: "Budget Transparency" },
    { id: "federal-funds", label: "Federal Funds" },
    { id: "trump", label: "Trump & Federal Relations" },
  ],
  candidates: [
    todoCandidate({
      id: "cohen",
      name: "Malia M. Cohen",
      party: "Democratic",
      currentRole: "California State Controller (incumbent, seeking re-election)",
      pastRoles: ["Chair, California State Board of Equalization (2019–2023)", "President, San Francisco Board of Supervisors"],
    }),
    todoCandidate({ id: "controller-r", name: "TBD Republican Challenger", party: "Republican", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// TREASURER
// ─────────────────────────────────────────────────────────────
export const treasurer: Race = {
  id: "treasurer",
  office: "Treasurer",
  jurisdiction: "California Statewide",
  format: "Top-Two Open Primary",
  formatExplainer:
    "Top two regardless of party advance to November. The Treasurer is California's banker — managing investments, issuing bonds, and chairing major housing and climate finance authorities.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "$181,725 / yr" },
    { label: "Vacancy", value: "Open seat (Ma term-limited)" },
    { label: "Last winner", value: "Ma 2022 — 56.6%" },
  ],
  unopposed: false,
  intro: {
    context:
      "Treasurer Fiona Ma is term-limited after two full terms, opening the office in a cycle when bond markets are <mark>actively pricing climate and political risk</mark> into California debt issuance. The Treasurer sets the state's borrowing strategy, manages over $100B in pooled state investments, and chairs the California Housing Finance Agency and the state's climate-finance authorities.",
    whyItMatters:
      "This is the office that quietly determines whether California can <mark>build housing at scale</mark>, finance climate adaptation, and respond to wildfire-driven insurance collapse. The Treasurer's investment posture also shapes how $700B+ in state-adjacent pension assets are deployed. They issue every bond California sells.",
    bigPicture:
      "Bond markets are increasingly skeptical of California climate risk: insurance carrier withdrawals, wildfire exposure, and federal posture have all pushed up borrowing costs at the margins. The next Treasurer will set strategy on green bonds, public banking experiments authorized by AB 857, an aggressive housing-finance push tied to the new statewide housing crisis, and pension-fund ESG and divestment policy.",
    whatsAtStake:
      "Bond issuance costs (every basis point is hundreds of millions over the life of state debt). Climate-finance ambition and green-bond scale. Public banking pilots. Housing finance scale and CalHFA priorities. CalPERS/CalSTRS investment guidance, including ESG and fossil-fuel divestment.",
    polling: "Open seat with limited polling; field still forming.",
  },
  issues: [
    { id: "bond-strategy", label: "Bond Strategy" },
    { id: "housing-finance", label: "Housing Finance" },
    { id: "climate-finance", label: "Climate Finance" },
    { id: "public-banking", label: "Public Banking" },
    { id: "pension-investment", label: "Pension Investment" },
    { id: "transparency", label: "Transparency" },
  ],
  candidates: [
    todoCandidate({ id: "treasurer-d-1", name: "TBD Democratic Candidate", party: "Democratic", currentRole: "TBD" }),
    todoCandidate({ id: "treasurer-d-2", name: "TBD Democratic Candidate", party: "Democratic", currentRole: "TBD" }),
    todoCandidate({ id: "treasurer-r", name: "TBD Republican Candidate", party: "Republican", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// ATTORNEY GENERAL
// ─────────────────────────────────────────────────────────────
export const attorneyGeneral: Race = {
  id: "attorney-general",
  office: "Attorney General",
  jurisdiction: "California Statewide",
  format: "Top-Two Open Primary",
  formatExplainer:
    "Top two regardless of party advance to November. The Attorney General is California's top law enforcement officer and the lead legal counterweight to the federal government.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "$199,896 / yr" },
    { label: "Incumbent", value: "Rob Bonta (D), appointed 2021" },
    { label: "Last winner", value: "Bonta 2022 — 59.8%" },
  ],
  unopposed: false,
  intro: {
    context:
      "Attorney General Rob Bonta, appointed by Gov. Newsom in 2021 to succeed Xavier Becerra and elected in his own right in 2022, is seeking re-election in a cycle defined by California's <mark>running legal war with the Trump administration</mark> over immigration, environmental rollbacks, federal funding clawbacks, and reproductive-rights enforcement. Bonta has filed dozens of multi-state amicus briefs and lead lawsuits since January 2025.",
    whyItMatters:
      "California's Attorney General is the <mark>most consequential state legal officer in the country</mark>. Lawsuits filed in San Francisco and Sacramento reshape national policy on immigration, climate, antitrust, consumer protection, and reproductive rights. Bonta has positioned the office as the legal opposition's headquarters — and a Republican replacement would reverse that posture across the board.",
    bigPicture:
      "The Bonta era has prioritized aggressive Trump-era litigation, big-tech antitrust, reproductive-rights defense, and Prop 36 retail-theft enforcement. California's AG also leads the multi-state coalition that has shaped national policy on <mark>everything from net neutrality to PFAS regulation</mark>. The 2026 contest is partly a referendum on that posture.",
    whatsAtStake:
      "California's litigation posture toward the federal government. Criminal-justice reform implementation, including how Prop 36 is enforced. Antitrust action against tech monopolies. Environmental enforcement (CEQA, PFAS, water rights). Gun-safety statute defense in the courts. Reproductive-rights and patient-travel protections.",
    polling: "Incumbent advantage; competitive Republican challenge tied to public-safety messaging.",
  },
  issues: [
    { id: "trump-litigation", label: "Trump-era Litigation" },
    { id: "criminal-justice", label: "Criminal Justice" },
    { id: "consumer-protection", label: "Consumer Protection" },
    { id: "civil-rights", label: "Civil Rights" },
    { id: "environment", label: "Environmental Enforcement" },
    { id: "gun-safety", label: "Gun Safety" },
    { id: "reproductive-rights", label: "Reproductive Rights" },
  ],
  candidates: [
    todoCandidate({
      id: "bonta",
      name: "Rob Bonta",
      party: "Democratic",
      currentRole: "California Attorney General (incumbent, seeking re-election)",
      pastRoles: ["California State Assemblymember, 18th district (2012–2021)", "Deputy City Attorney, San Francisco"],
    }),
    todoCandidate({ id: "ag-r", name: "TBD Republican Challenger", party: "Republican", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// INSURANCE COMMISSIONER
// ─────────────────────────────────────────────────────────────
export const insuranceCommissioner: Race = {
  id: "insurance-commissioner",
  office: "Insurance Commissioner",
  jurisdiction: "California Statewide",
  format: "Top-Two Open Primary",
  formatExplainer:
    "Top two regardless of party advance to November. The Insurance Commissioner regulates California's $360B insurance market — including the wildfire-driven home insurance crisis that has destabilized whole regions of the state.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "$181,725 / yr" },
    { label: "Vacancy", value: "Open seat (Lara term-limited)" },
    { label: "Last winner", value: "Lara 2022 — 58.0%" },
  ],
  unopposed: false,
  intro: {
    context:
      "Commissioner Ricardo Lara is term-limited as California's home-insurance market sits in <mark>its worst crisis in modern memory</mark>: State Farm, Allstate, Farmers, USAA and others paused or restricted new policies between 2023 and 2025. The FAIR Plan (the insurer of last resort) has ballooned to over 600,000 policies and is straining its reinsurance. Lara's late-term reform package — catastrophe modeling, reinsurance pass-through, and faster rate review — is partly in effect, but the market has not normalized.",
    whyItMatters:
      "The Insurance Commissioner sets rates, regulates carriers, and runs the FAIR Plan of last resort. They are <mark>the single most consequential person to your home, car, and health insurance bill</mark>. The office also oversees the workers' comp market, health insurance plan rate review, and consumer complaints across all lines.",
    bigPicture:
      "The wildfire-driven crisis has reshaped California insurance regulation. The next commissioner inherits a Lara-era reform package that has yet to fully unwind the market dysfunction, FAIR Plan policies that may need a rescue, and an emerging climate-risk disclosure regime that is still being negotiated with carriers.",
    whatsAtStake:
      "Whether home insurance becomes available again in fire-prone areas. FAIR Plan solvency and whether the state will need to backstop it. Climate-risk disclosure rules. Whether the Lara reform package's reinsurance pass-through actually lowers consumer premiums. Health-insurance rate review aggressiveness. Auto-insurance reform after years of post-pandemic premium spikes.",
    polling: "Open seat; field forming. Insurance Commissioner is historically a low-profile race that turns on partisan baseline.",
  },
  issues: [
    { id: "wildfire-insurance", label: "Wildfire Insurance" },
    { id: "fair-plan", label: "FAIR Plan" },
    { id: "rate-regulation", label: "Rate Regulation" },
    { id: "climate-risk", label: "Climate Risk" },
    { id: "consumer-protection", label: "Consumer Protection" },
    { id: "health-insurance", label: "Health Insurance" },
    { id: "auto-insurance", label: "Auto Insurance" },
  ],
  candidates: [
    todoCandidate({ id: "ic-d-1", name: "TBD Democratic Candidate", party: "Democratic", currentRole: "TBD" }),
    todoCandidate({ id: "ic-d-2", name: "TBD Democratic Candidate", party: "Democratic", currentRole: "TBD" }),
    todoCandidate({ id: "ic-r", name: "TBD Republican Candidate", party: "Republican", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// SUPERINTENDENT OF PUBLIC INSTRUCTION
// ─────────────────────────────────────────────────────────────
export const supPublicInstruction: Race = {
  id: "sup-public-instruction",
  office: "Superintendent of Public Instruction",
  jurisdiction: "California Statewide",
  format: "Nonpartisan Top-Two Primary",
  formatExplainer:
    "Officially nonpartisan — party affiliation does not appear next to the candidate's name on the ballot. Top two advance to November. The Superintendent runs the California Department of Education and is the elected head of K-12 schools.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "$181,725 / yr" },
    { label: "Vacancy", value: "Open (Thurmond running for governor)" },
    { label: "Last winner", value: "Thurmond 2022 — 64.4%" },
  ],
  unopposed: false,
  intro: {
    context:
      "Tony Thurmond is running for governor instead of seeking a third term, opening the elected K-12 leadership of California for the first time since 2018. The cycle is dominated by <mark>post-COVID learning loss</mark>, the future of school choice, and the front-line battle over ethnic studies, gender-identity instruction, and federal Title IX/Title VI reorientation under Trump 2.0.",
    whyItMatters:
      "The Superintendent oversees <mark>$130B in K-12 spending</mark> and runs the California Department of Education — about 5.8 million students across 1,000+ districts. They are the single most consequential figure in California school policy outside the Governor's office, and the elected counterpart to the appointed State Board of Education.",
    bigPicture:
      "The federal Department of Education was significantly reorganized in 2025; California is now navigating Title I funds, Title IX enforcement, and IDEA implementation under a hostile federal posture. Post-pandemic learning loss recovery is on a 5–10 year curve. Charter authorization disputes, AI in classrooms, and ethnic studies are all live political flashpoints.",
    whatsAtStake:
      "Curriculum standards, including ethnic studies and FAIR Act implementation. Charter authorization rules and the LA Unified renewal queue. Learning-loss recovery strategy and tutoring funding. AI-in-classroom guidance and student data protection. The state's response to federal Title IX and Title VI reorientation. Parent-notification and gender-identity policies.",
    polling: "Open seat; nonpartisan field forming. Historically the office attracts education insiders, charter advocates, and reformers.",
  },
  issues: [
    { id: "learning-loss", label: "Learning Loss Recovery" },
    { id: "charter-schools", label: "Charter Schools" },
    { id: "achievement-gap", label: "Achievement Gap" },
    { id: "ai-classroom", label: "AI in Classrooms" },
    { id: "ethnic-studies", label: "Ethnic Studies & Curriculum" },
    { id: "school-safety", label: "School Safety" },
    { id: "federal-relations", label: "Federal Relations" },
  ],
  candidates: [
    todoCandidate({ id: "spi-1", name: "TBD Major Candidate", party: "No Party Preference", currentRole: "TBD" }),
    todoCandidate({ id: "spi-2", name: "TBD Major Candidate", party: "No Party Preference", currentRole: "TBD" }),
    todoCandidate({ id: "spi-3", name: "TBD Major Candidate", party: "No Party Preference", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// BOARD OF EQUALIZATION DISTRICT 2
// ─────────────────────────────────────────────────────────────
export const boe2: Race = {
  id: "boe-d2",
  office: "Member, State Board of Equalization, District 2",
  jurisdiction: "BOE District 2 — Bay Area & North Coast",
  format: "Top-Two Open Primary",
  formatExplainer:
    "Top two regardless of party advance to November. BOE District 2 covers most of the Bay Area, including all of San Mateo County, plus the North Coast — roughly 9.5 million residents.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "$165,288 / yr" },
    { label: "Incumbent", value: "Sally Lieber (D), elected 2022" },
    { label: "Last winner", value: "Lieber 2022 — 53.5%" },
  ],
  unopposed: false,
  intro: {
    context:
      "Member Sally Lieber, elected to BOE District 2 in 2022 after a long career as Mountain View mayor and state Assemblymember, is seeking re-election. The State Board of Equalization is California's <mark>oldest constitutional tax body</mark>, dating to 1879, and was significantly restructured in 2017 — most of its tax-collection authority moved to the new CDTFA, but it retained property-tax oversight and assessment-appeals jurisdiction.",
    whyItMatters:
      "The BOE oversees the <mark>uniform property-tax assessment</mark> of public utilities and railroads (assets that cross county lines), adjudicates assessment appeals on a statewide basis, and reviews how the 58 county assessors apply Prop 13. <mark>Decisions here shape commercial real-estate taxation</mark> across the Bay Area — including how aggressively recently sold properties get reassessed.",
    bigPicture:
      "The BOE's authority was deliberately trimmed in 2017 after years of internal scandal, but its remaining role on assessment appeals, public-utility taxation, and equity in tax administration is consequential — particularly for commercial property in the Bay Area, where reassessment rules under Prop 13 are the largest single subsidy in the state tax code.",
    whatsAtStake:
      "Commercial property tax assessment fairness. Whether the BOE pushes county assessors toward more aggressive reassessment of sold commercial properties. Equity in tax administration (low-income property tax relief). Appeals processing speed. Consumer-side fairness on small-business sales-tax disputes that escalate to the BOE.",
    polling: "Limited downballot polling; incumbent advantage in a deep-blue district.",
  },
  issues: [
    { id: "tax-administration", label: "Tax Administration" },
    { id: "property-appeals", label: "Property Tax Appeals" },
    { id: "assessment-equity", label: "Assessment Equity" },
    { id: "small-business", label: "Small Business Sales Tax" },
    { id: "transparency", label: "BOE Transparency" },
  ],
  candidates: [
    todoCandidate({
      id: "lieber",
      name: "Sally J. Lieber",
      party: "Democratic",
      currentRole: "Member, State Board of Equalization, District 2 (incumbent)",
      pastRoles: ["Mayor of Mountain View", "California State Assemblymember, 22nd district"],
    }),
    todoCandidate({ id: "boe-r", name: "TBD Republican Challenger", party: "Republican", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// 15TH CONGRESSIONAL DISTRICT
// ─────────────────────────────────────────────────────────────
export const ca15: Race = {
  id: "ca-15",
  office: "U.S. Representative, 15th Congressional District",
  jurisdiction: "Most of San Mateo County + southeastern San Francisco County",
  format: "Top-Two Open Primary",
  formatExplainer:
    "Top two regardless of party advance to November. CA-15 covers Daly City, South San Francisco, San Bruno, San Mateo, Burlingame, Foster City, Redwood City, and the southeastern portion of San Francisco — about 760,000 residents.",
  meta: [
    { label: "Term", value: "2 years" },
    { label: "Salary", value: "$174,000 / yr" },
    { label: "Incumbent", value: "Kevin Mullin (D), elected 2022" },
    { label: "Last winner", value: "Mullin 2024 — 73.7%" },
  ],
  unopposed: false,
  intro: {
    context:
      "Rep. Kevin Mullin, the former Speaker pro Tem of the California State Assembly who succeeded the retiring Jackie Speier in 2022, is seeking a third term in a deep-blue Bay Area district. The central question is whether a credible Democrat will mount a primary challenge from his left, and whether <mark>Trump 2.0's posture toward sanctuary jurisdictions</mark> will reshape the district's political center of gravity.",
    whyItMatters:
      "CA-15 represents San Mateo County and southeastern San Francisco in Washington — the seat your member uses to vote on federal funding fights, immigration enforcement votes, AI/tech regulation, climate spending, and the running congressional fight with Trump 2.0. Mullin sits on the House Science, Space and Technology Committee and the Veterans' Affairs Committee.",
    bigPicture:
      "Bay Area Democrats are split between institutionalists (Mullin's lane: deliver appropriations, work the committee process) and an active progressive insurgent base seeking sharper resistance. Trump's federal posture has heightened the case for either continuity or a sharper-edged successor. <mark>San Mateo County's federal funding dependencies</mark> — Caltrain, BART extension, SFO, biotech research grants — are real leverage points.",
    whatsAtStake:
      "San Mateo County's voice in federal funding fights. Immigration policy votes (sanctuary, ICE detention, asylum). AI and tech regulation (the district contains Genentech, biotech R&D, and is adjacent to Silicon Valley). Climate spending. The running impeachment-and-investigation cycle. Caltrain and BART federal funding.",
    polling: "Incumbent advantage; primary challenge to be assessed.",
  },
  issues: [
    { id: "trump-federal", label: "Trump & Federal Relations" },
    { id: "immigration", label: "Immigration" },
    { id: "tech-ai", label: "Tech & AI Regulation" },
    { id: "housing-federal", label: "Federal Housing Policy" },
    { id: "climate-federal", label: "Federal Climate Policy" },
    { id: "healthcare-federal", label: "Federal Healthcare" },
    { id: "foreign-policy", label: "Foreign Policy" },
    { id: "transit", label: "Transit & Infrastructure" },
  ],
  candidates: [
    todoCandidate({
      id: "mullin",
      name: "Kevin Mullin",
      party: "Democratic",
      currentRole: "U.S. Representative, CA-15 (incumbent, seeking re-election)",
      pastRoles: [
        "California State Assemblymember, 22nd district (2012–2022)",
        "Speaker pro Tempore, California Assembly (2014–2016)",
        "Mayor of South San Francisco",
      ],
    }),
    todoCandidate({ id: "ca15-d-2", name: "TBD Democratic Challenger", party: "Democratic", currentRole: "TBD" }),
    todoCandidate({ id: "ca15-r", name: "TBD Republican Challenger", party: "Republican", currentRole: "TBD" }),
  ],
};

// ─────────────────────────────────────────────────────────────
// 19TH ASSEMBLY DISTRICT  (Catherine Stefani — covers Daly City + parts of SF)
// ─────────────────────────────────────────────────────────────
export const ad19: Race = {
  id: "ad-19",
  office: "California State Assembly, 19th District",
  jurisdiction: "Daly City, Pacifica, parts of San Bruno + western San Francisco",
  format: "Top-Two Open Primary",
  formatExplainer:
    "Top two regardless of party advance to November. AD-19 covers the northern San Mateo County coast (Daly City, Pacifica, Brisbane, Colma, parts of San Bruno) plus western San Francisco neighborhoods (Sunset, Richmond, Sea Cliff).",
  meta: [
    { label: "Term", value: "2 years" },
    { label: "Salary", value: "$128,215 / yr" },
    { label: "Incumbent", value: "Catherine Stefani (D), elected 2024" },
    { label: "Last winner", value: "Stefani 2024 — 64% (open seat)" },
  ],
  unopposed: false,
  intro: {
    context:
      "Assemblymember Catherine Stefani, the former San Francisco Supervisor for District 2, was elected to AD-19 in 2024 after Phil Ting was term-limited. She is seeking her first re-election in a district that <mark>spans the SF–San Mateo county line</mark> — a rare cross-county seat that ties Daly City's largely working-class Asian-American and Latino population to western SF's middle-class homeowner neighborhoods. She built her political identity at the SF Board on gun-violence prevention and Recall Boudin–era public-safety policy.",
    whyItMatters:
      "AD-19 is the seat your Daly City / Pacifica Assembly representative uses to vote on housing law (CEQA reform, ADU rules, density mandates), state-level AI regulation, the state budget that pays for local services, and gun-safety statutes. Stefani sits on the Public Safety, Housing, and Privacy & Consumer Protection committees.",
    bigPicture:
      "Northern San Mateo County is the front line of California's housing affordability fight — Daly City's median home price is in the $1.4M+ range, and the district's renter share is above 50%. Stefani has positioned herself in the <mark>YIMBY-Democrat lane</mark>: pro-housing density, pro-CEQA-reform, pro-public-safety, pragmatic on Sacramento spending. The 2026 contest will likely test whether progressive challenges can land in a district that voted decisively for her on a public-safety-first platform in 2024.",
    whatsAtStake:
      "Statewide housing law, including by-right approval, ADU mandates, and CEQA reform — Stefani has been a reliable yes vote. Gun-safety statute defense in the courts. State-level AI regulation. Coastal climate adaptation funding (Pacifica is among the most exposed shorelines in California). Caltrain and BART operations funding. Transportation funding for Highway 1.",
    polling: "Incumbent advantage; primary challenge field still forming.",
  },
  issues: [
    { id: "housing-state", label: "State Housing Law" },
    { id: "transportation", label: "Transportation" },
    { id: "ai-state", label: "State AI Regulation" },
    { id: "climate-coastal", label: "Coastal Climate" },
    { id: "education-local", label: "Local Education" },
    { id: "public-safety", label: "Public Safety" },
    { id: "gun-safety", label: "Gun Safety" },
  ],
  candidates: [
    todoCandidate({
      id: "stefani",
      name: "Catherine Stefani",
      party: "Democratic",
      currentRole: "California State Assemblymember, AD-19 (incumbent, seeking re-election)",
      pastRoles: [
        "San Francisco Supervisor, District 2 (2018–2024)",
        "Aide to former CA Lt. Gov. Gavin Newsom",
        "Aide to former SF DA Kamala Harris",
      ],
    }),
    todoCandidate({ id: "ad19-2", name: "TBD Democratic Challenger", party: "Democratic", currentRole: "TBD" }),
    todoCandidate({ id: "ad19-3", name: "TBD Republican Challenger", party: "Republican", currentRole: "TBD" }),
  ],
};
