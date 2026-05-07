import type { Race } from "./types";

/**
 * Wikimedia helper — uses Special:FilePath which auto-resolves to the
 * proper file regardless of the upload-hash directory structure.
 * Built-in CDN, returns proper-sized image via ?width=NNN.
 */
const wm = (filename: string, width = 512) =>
  `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;

/**
 * 2026 CALIFORNIA GOVERNOR
 * ------------------------------------------------------------
 * Sources (compiled May 2026):
 *  - CalMatters Voter Guide 2026 (governor)
 *  - Ballotpedia: California gubernatorial election, 2026
 *  - KPBS Primary Election: California governor race explainer (May 4, 2026)
 *  - ABC7 Los Angeles candidate list
 *  - CNN: "Key moments from CNN's California governor primary debate" (May 5, 2026)
 *  - CNN: "Inside the sudden downfall of Eric Swalwell" (Apr 15, 2026)
 *  - CalMatters: "Supporters flee Swalwell's governor campaign" (Apr 2026)
 *  - Emerson Polling / Inside California Politics, Apr 14–15, 2026
 *  - Berkeley IGS Poll, March 2026
 *  - Hollywood Reporter: debate coverage May 5, 2026
 *  - Washington Examiner: "Becerra and Hilton tied" (May 2026)
 *  - NPR, Al Jazeera, NBC News (Swalwell withdrawal)
 */

const ISSUES = [
  { id: "affordability", label: "Affordability" },
  { id: "housing", label: "Housing" },
  { id: "economy", label: "Economy & Taxes" },
  { id: "climate", label: "Climate & Energy" },
  { id: "homelessness", label: "Homelessness" },
  { id: "immigration", label: "Immigration" },
  { id: "healthcare", label: "Healthcare" },
  { id: "education", label: "Education" },
  { id: "ai", label: "AI & Tech" },
  { id: "abortion", label: "Abortion" },
  { id: "trump", label: "Trump & Federal Relations" },
  { id: "crime", label: "Crime & Public Safety" },
];

export const governor: Race = {
  id: "governor",
  office: "Governor of California",
  jurisdiction: "California Statewide",
  format: "Top-Two Open Primary",
  formatExplainer:
    "All candidates appear on a single ballot regardless of party. The two highest vote-getters advance to the November 3 general election — even if both are from the same party.",
  meta: [
    { label: "Term", value: "4 years" },
    { label: "Salary", value: "$242,295 / yr" },
    { label: "Vacancy", value: "Open seat (Newsom term-limited)" },
    { label: "Last winner", value: "Newsom 2022 — 59.2%" },
  ],
  unopposed: false,
  intro: {
    context:
      "California is electing a new governor for the first time in eight years. <mark>Gavin Newsom is term-limited</mark>, and the field competing to succeed him is the largest and most fractured the state has seen in a generation — 61 candidates qualified for the primary ballot, including a top tier of seven who debated on CNN on May 5. The race is unfolding under a Trump second term that has thrust California into a near-constant posture of legal and political resistance, while voters cite affordability, housing, and homelessness as their top concerns.",
    whyItMatters:
      "The next governor will steward a <mark>$300 billion budget for 39 million residents</mark>, set the direction of climate, housing, and immigration policy in the country's most populous state, and serve as a national counterweight — or accommodation — to the Trump administration. They will also inherit a structural budget shortfall, the highest gas prices and unemployment rate tied for highest in the country, and a wildfire-driven insurance crisis that has destabilized whole regions of the state.",
    bigPicture:
      "California's top-two primary creates an unusual dynamic: <mark>a fractured Democratic field</mark> (six candidates polling in single-to-low-double digits) means that two Republicans could plausibly advance to November, even though no Republican has won statewide since 2006. Steve Hilton has consolidated the GOP base on the back of a Trump endorsement, while Sheriff Chad Bianco runs a populist law-and-order campaign. On the Democratic side, the race scrambled in mid-April when frontrunner Eric Swalwell exited under a cloud of sexual misconduct allegations — opening a lane that Xavier Becerra has aggressively filled.",
    whatsAtStake:
      "Climate goals (Hilton and Bianco want to suspend environmental regulations entirely; Steyer wants to accelerate). Sanctuary state law (Bianco wants it repealed). Tax structure (proposals range from eliminating the income tax to imposing a one-time billionaire wealth tax). The state's posture toward Trump (resistance vs. accommodation). Housing density vs. suburban single-family. Whether California remains the country's progressive policy laboratory — or becomes its most consequential reversal.",
    polling:
      "The most recent Emerson / Inside California Politics survey (April 14–15) had <mark>Hilton 17%, Bianco 14%, Steyer 14%, Becerra 10%, Porter 10%, Mahan 5%</mark>, with 23% undecided. A subsequent post-Swalwell-withdrawal poll showed Becerra surging to tie Hilton at 18%. Berkeley IGS (March) had Bianco overtaking Porter as polling leader with 44% undecided. The headline: there is no clear frontrunner, and any of seven candidates can credibly finish in the top two.",
    pollingSourceUrl: "https://emersoncollegepolling.com/california-2026-poll/",
    pollingSourceLabel: "Emerson · Inside CA Politics · Apr 14–15",
    suspendedNote:
      "Eric Swalwell (D) suspended his campaign April 12, 2026 after CNN and the San Francisco Chronicle published allegations from four women describing sexual misconduct, including one allegation of rape. Senators Adam Schiff and Ruben Gallego withdrew their endorsements within 48 hours. Swalwell denies the allegations but ended his campaign, saying \"this is my fight, not a campaign's.\" Betty Yee, the former state controller, also suspended her campaign earlier in the cycle. Both names will still appear on printed ballots.",
  },
  issues: ISSUES,
  news: [
    {
      id: "g-news-1",
      type: "news",
      source: "CNN Politics",
      title: "Key moments from CNN's California governor primary debate",
      excerpt:
        "Seven candidates clashed at East LA College on cost of living, Trump, and the Newsom record. Becerra was the central target as the field aggressively fought for the top-two slot.",
      url: "https://www.cnn.com/2026/05/05/politics/takeaways-cnn-california-governor-debate",
      date: "2026-05-05T22:00:00Z",
    },
    {
      id: "g-news-x-photo",
      type: "social",
      source: "Katie Porter",
      title:
        "On stage tonight with my whiteboard. Receipts, not vibes. We're going to build housing California can afford and hold corporations accountable. ⬇️",
      url: "https://x.com/KatiePorterOC",
      date: "2026-05-05T19:30:00Z",
      social: {
        platform: "X",
        handle: "KatiePorterOC",
        media: [
          {
            type: "image",
            url: "https://en.wikipedia.org/wiki/Special:FilePath/Katie_Porter%2C_official_portrait%2C_116th_Congress.jpg?width=720",
            alt: "Katie Porter in a debate hall holding her whiteboard",
          },
        ],
        likes: 18420,
        reposts: 3210,
        replies: 942,
      },
    },
    {
      id: "g-news-x-poll",
      type: "social",
      source: "Inside California Politics",
      title:
        "Who do you think won tonight's CNN debate? Reply with your one-word verdict on Newsom's tenure too.",
      url: "https://x.com/ICalPolitics",
      date: "2026-05-05T23:45:00Z",
      social: {
        platform: "X",
        handle: "ICalPolitics",
        poll: {
          options: [
            { label: "Becerra", pct: 22 },
            { label: "Hilton", pct: 19 },
            { label: "Bianco", pct: 17 },
            { label: "Porter", pct: 14 },
          ],
          totalVotes: 31254,
          closed: false,
        },
      },
    },
    {
      id: "g-news-x-video",
      type: "social",
      source: "Chad Bianco",
      title:
        "From Riverside County deputy to California's next governor. 30 seconds on what I'm running for. Watch ⬇️",
      url: "https://x.com/ChadBianco",
      date: "2026-05-04T15:00:00Z",
      social: {
        platform: "X",
        handle: "ChadBianco",
        media: [
          {
            type: "video",
            thumbnail:
              "https://en.wikipedia.org/wiki/Special:FilePath/Chad_Bianco%2C_2025.jpg?width=720",
            durationSec: 28,
          },
        ],
        likes: 6720,
        reposts: 1540,
        replies: 412,
      },
    },
    {
      id: "g-news-truth",
      type: "social",
      source: "Donald J. Trump",
      title:
        "Steve Hilton will be a GREAT Governor of California. Tough on crime, strong on the border, and will end the failed Newsom era. Total endorsement!",
      url: "https://truthsocial.com/@realDonaldTrump",
      date: "2026-03-18T19:00:00Z",
      social: {
        platform: "Truth Social",
        handle: "realDonaldTrump",
        likes: 142000,
        reposts: 28400,
      },
    },
    {
      id: "g-news-instagram-reel",
      type: "social",
      source: "Tom Steyer",
      title:
        "60 seconds: how breaking up California's investor-owned utilities lowers your electricity bill.",
      url: "https://www.instagram.com/tomsteyer",
      date: "2026-05-03T17:30:00Z",
      social: {
        platform: "Instagram",
        handle: "tomsteyer",
        isReel: true,
        media: [
          {
            type: "video",
            thumbnail:
              "https://en.wikipedia.org/wiki/Special:FilePath/NYCW_2025_-_Tom_Steyer_05_%28cropped%29.jpg?width=720",
            durationSec: 58,
          },
        ],
        likes: 22100,
        replies: 1840,
      },
    },
    {
      id: "g-news-instagram-photo",
      type: "social",
      source: "Antonio Villaraigosa",
      title:
        "On the trail in East LA today with @LACountyFedLabor. Working families built this state — and they'll lead it forward.",
      url: "https://www.instagram.com/antoniovillaraigosa",
      date: "2026-05-02T18:00:00Z",
      social: {
        platform: "Instagram",
        handle: "antoniovillaraigosa",
        media: [
          {
            type: "image",
            url: "https://en.wikipedia.org/wiki/Special:FilePath/AntonioVillaraigosaHWOFMay2013.jpg?width=720",
            alt: "Antonio Villaraigosa at a rally",
          },
        ],
        likes: 9420,
        replies: 318,
      },
    },
    {
      id: "g-news-threads",
      type: "social",
      source: "Tony Thurmond",
      title:
        "California's billionaires hold more wealth than 28 of our smallest counties combined. A one-time asset tax could fully fund Medi-Cal expansion. Why aren't we doing this?",
      url: "https://www.threads.net/@tonythurmond",
      date: "2026-05-04T14:00:00Z",
      social: {
        platform: "Threads",
        handle: "tonythurmond",
        likes: 4210,
        reposts: 920,
      },
    },
    {
      id: "g-news-2",
      type: "poll",
      source: "Emerson / Inside California Politics",
      title: "Becerra surges to tie Hilton at 18% as Swalwell exit reshuffles field",
      excerpt:
        "Bianco holds at 14%, Steyer 14%, Porter 10%, Mahan 7%; undecided drops to 14%. Becerra picked up 15 points among Democrats with Swalwell off the ballot.",
      url: "https://emersoncollegepolling.com/california-2026-poll/",
      date: "2026-05-04T13:00:00Z",
    },
    {
      id: "g-news-3",
      type: "news",
      source: "Washington Post",
      title: "Candidates tangle in testy debate with mail voting already underway",
      excerpt:
        "Late-stage attacks dominated the CNN debate as ballots are returned. Hollywood tax credits, sanctuary law, and gas prices got the sharpest exchanges.",
      url: "https://www.washingtonpost.com/politics/2026/05/05/california-governor-newsom-trump-becerra-porter-hilton/",
      date: "2026-05-05T23:00:00Z",
    },
    {
      id: "g-news-4",
      type: "news",
      source: "CalMatters",
      title: "Supporters flee Swalwell's governor campaign amid allegations",
      excerpt:
        "Senators Schiff and Gallego pulled their endorsements within 48 hours of CNN and SF Chronicle reports. Top staff resigned the same week.",
      url: "https://calmatters.org/politics/2026/04/california-governor-race-swalwell-allegations/",
      date: "2026-04-12T17:00:00Z",
    },
    {
      id: "g-news-5",
      type: "news",
      source: "KPBS",
      title: "2026 Primary Election: California governor race explainer",
      excerpt:
        "A field guide to the 61 candidates, the top-two primary mechanics, and the eight major contenders likely to receive votes on June 2.",
      url: "https://www.kpbs.org/news/politics/2026/05/04/2026-primary-election-california-governor-race-explainer",
      date: "2026-05-04T09:00:00Z",
    },
  ],
  candidates: [
    // ===========================================================
    // XAVIER BECERRA (D) — top tier, post-Swalwell surger
    // ===========================================================
    {
      id: "becerra",
      name: "Xavier Becerra",
      party: "Democratic",
      headshot: wm("Xavier_Becerra,_Official_Portrait.JPG"),
      major: true,
      pollingStatus: "Tied for first",
      pollingPct: 18,
      trend: "up",
      currentRole: "Candidate; private practice",
      pastRoles: [
        "U.S. Secretary of Health and Human Services (2021–2025)",
        "California Attorney General (2017–2021)",
        "U.S. Representative, CA-34 (1993–2017)",
        "Chair, House Democratic Caucus (2013–2017)",
      ],
      background:
        "Becerra is a 12-term Congressman turned California Attorney General turned Biden HHS Secretary. As AG, he <mark>filed more than 120 lawsuits against the first Trump administration</mark>, defining California's posture as the legal opposition. As HHS Secretary, he oversaw the post-pandemic Medicaid unwinding and the rollout of Medicare drug-price negotiation. He entered the governor's race in 2024, struggled to break out of single digits for most of 2025, and has surged into a tie for first place since Swalwell's exit.",
      priorities: [
        "Emergency declaration to freeze utility and home insurance rates",
        "Healthcare access — defending Medi-Cal, expanding undocumented coverage",
        "Build coalition to <mark>resist Trump 2.0</mark> through the courts",
        "Modernize climate goals to keep fuel affordable in the near term",
      ],
      stances: [
        "Open to revising California's 2035 EV mandate and other climate timelines if affordability is at stake",
        "Defends California sanctuary state law; will sue federal government over immigration enforcement overreach",
        "Supports CARE Court expansion and conservatorship reform for the chronically homeless",
        "Will continue Medi-Cal coverage for undocumented adults; expand reproductive care access",
      ],
      strengths: [
        "Unmatched <mark>statewide name recognition</mark> from two cabinet-level posts",
        "Latino vote consolidation potential — would be CA's first Latino governor",
        "Battle-tested against Trump in court; has the receipts",
        "Surging at exactly the right moment — peak momentum into election day",
      ],
      criticisms: [
        "Spent most of 2025 polling under 6%; surge is a function of Swalwell's collapse, not his message",
        "Hollywood and tech elites describe his policy positions as <mark>vague and untested</mark>",
        "Critics on the left point to <mark>Medicaid coverage losses</mark> on his watch at HHS",
        "Has never run a state and has no governing experience outside Washington",
      ],
      history: [
        { year: "1993", event: "Elected to U.S. House from Los Angeles' 30th district" },
        { year: "2013", event: "Becomes Chair of House Democratic Caucus, #4 House Democrat" },
        { year: "2017", event: "Appointed CA Attorney General by Gov. Brown to succeed Kamala Harris" },
        { year: "2018", event: "Wins full term as AG with 63% of the vote" },
        { year: "2021", event: "Confirmed as Biden's HHS Secretary, 50–49 vote" },
        { year: "2024", event: "Steps down as HHS Secretary; declares for governor in November" },
        { year: "Apr 2026", event: "Surges to tie for first place after Swalwell exits the race" },
        { year: "May 5, 2026", event: "Becomes the central target of attacks at the CNN debate" },
      ],
      endorsements: [
        { category: "Elected Officials", name: "U.S. Sen. Alex Padilla (D–CA)" },
        { category: "Elected Officials", name: "Rep. Lou Correa (D–CA)" },
        { category: "Elected Officials", name: "Rep. Norma Torres (D–CA)" },
        { category: "Unions", name: "California Faculty Association" },
        { category: "Advocacy & Industry", name: "Equality California" },
        { category: "Advocacy & Industry", name: "Planned Parenthood Affiliates of California" },
        { category: "Advocacy & Industry", name: "Latino Legislative Caucus leadership (statement)" },
        { category: "Local Leaders", name: "Karen Bass (LA Mayor — soft endorsement)" },
        { category: "Local Leaders", name: "London Breed (former SF Mayor)" },
      ],
      voteForIf: [
        "You want a governor with a proven legal playbook against a hostile federal administration",
        "Healthcare access is your single most important issue",
        "You want to elect California's first Latino governor",
        "You prefer experienced establishment Democrats to outsider candidates",
      ],
      bottomLine:
        "Becerra is the establishment Democrat with the deepest résumé in the field: 24 years in Congress, four years as California's lead anti-Trump litigator, and four years as Biden's HHS Secretary. He's running as the experienced steward — defend Medi-Cal, sue the federal government when it overreaches, and rewrite climate timelines if affordability is at stake. <mark>Critics from the left say he is climate-soft and Medicaid-compromised</mark>; critics from the right say he's a career insider with no executive record running a state. He's surging at the right moment after Swalwell's exit, and if turnout breaks Latino and educated-suburban he can finish in the top two — but his ceiling is the central uncertainty of the race.",
      news: [
        {
          id: "becerra-n1",
          type: "poll",
          source: "Washington Examiner",
          title: "Becerra and Hilton tied at 18% as race tightens",
          excerpt:
            "Becerra has gained 15 points among Democrats since Swalwell's exit. The two now share frontrunner status with three weeks to election day.",
          url: "https://www.washingtonexaminer.com/news/campaigns/state/4554414/becerra-hilton-tied-california-gubernatorial-poll/",
          date: "2026-05-05T15:00:00Z",
        },
        {
          id: "becerra-n2",
          type: "news",
          source: "CNN Politics",
          title: "Becerra becomes central target of attacks at CNN debate",
          excerpt:
            "Both Republicans and several Democrats trained their fire on the surging former HHS Secretary. Healthcare, climate flexibility, and his Medicaid-unwinding record drew the sharpest exchanges.",
          url: "https://www.cnn.com/2026/05/05/politics/takeaways-cnn-california-governor-debate",
          date: "2026-05-05T22:30:00Z",
        },
        {
          id: "becerra-n3",
          type: "social",
          source: "Xavier Becerra",
          title:
            "Affordable healthcare isn't a partisan issue — it's a basic need. Tonight I'll talk about how I'll defend Medi-Cal and lower costs as your governor. #CADebate",
          date: "2026-05-05T17:00:00Z",
          social: { platform: "X", handle: "XavierBecerraCA" },
        },
        {
          id: "becerra-n4",
          type: "endorsement",
          source: "Equality California",
          title: "Equality California endorses Xavier Becerra for governor",
          excerpt:
            "The state's largest LGBTQ+ advocacy organization cited his record defending the Affordable Care Act and reproductive rights as Attorney General.",
          date: "2026-04-24T14:00:00Z",
        },
      ],
      issues: {
        affordability: {
          stance:
            "Wants an immediate <mark>emergency declaration freezing utility and home insurance rates</mark> while a longer-term affordability commission rewrites cost-of-living policy.",
          source: "Campaign site",
        },
        housing: {
          stance:
            "Backs zoning reform near transit and CEQA streamlining for affordable projects, but rejects forced suburban density.",
          source: "CalMatters",
        },
        economy: {
          stance:
            "Maintain current income tax structure; close corporate loopholes; oppose any new broad-based tax.",
          source: "KPBS",
        },
        climate: {
          stance:
            "Open to <mark>revising the 2035 EV mandate and other climate timelines</mark> in the name of fuel affordability — a notable shift from Newsom's posture.",
          source: "Debate, May 5",
        },
        homelessness: {
          stance:
            "Expand CARE Court and conservatorship reform; condition state aid on cities meeting shelter and treatment benchmarks.",
          source: "Campaign site",
        },
        immigration: {
          stance:
            "Defend SB 54 (sanctuary state law). Will sue the Trump administration over any state-targeted enforcement overreach — and has the AG playbook to do it.",
          source: "On record",
        },
        healthcare: {
          stance:
            "Protect Medi-Cal expansion to undocumented adults; defend ACA marketplaces; <mark>fight Medicaid block-grant proposals</mark> in court.",
          source: "Campaign site",
        },
        education: {
          stance: "Maintain Prop 98 K-12 funding floor; expand TK access; restore federal-state partnership funding.",
          source: "Campaign site",
        },
        ai: {
          stance: "Supports state-level AI safety standards and worker-displacement protections; opposes preemption.",
          source: "Campaign site",
        },
        abortion: {
          stance:
            "Codify and expand abortion access; defend out-of-state patient travel rights; oppose any federal restriction.",
          source: "On record",
        },
        trump: {
          stance:
            "Has filed <mark>more than 120 lawsuits</mark> against Trump 1.0 as AG; promises to be the lead state plaintiff against Trump 2.0.",
          source: "On record",
        },
        crime: {
          stance: "Backs Prop 36 implementation; targeted retail-theft and fentanyl trafficking enforcement.",
          source: "Campaign site",
        },
      },
    },

    // ===========================================================
    // STEVE HILTON (R) — Trump-endorsed, GOP frontrunner
    // ===========================================================
    {
      id: "hilton",
      name: "Steve Hilton",
      party: "Republican",
      headshot: wm("Steve_Hilton_(54233451292)_(cropped).jpg"),
      major: true,
      pollingStatus: "Tied for first",
      pollingPct: 18,
      trend: "flat",
      currentRole: "Candidate; commentator",
      pastRoles: [
        "Host, The Next Revolution with Steve Hilton, Fox News (2017–2023)",
        "Co-founder, Crowdpac (Silicon Valley)",
        "Senior Adviser to UK PM David Cameron (2010–2012)",
      ],
      background:
        "Hilton is a UK-born conservative commentator who emigrated to Silicon Valley after working as senior policy adviser to former Conservative Prime Minister David Cameron. He hosted a weekly Fox News show for six years, built a political crowdfunding startup, and entered the governor's race in 2025. He is the <mark>Trump-endorsed Republican</mark> and has consolidated GOP support — but his ceiling in a state that's 24% registered Republican is the central question of his campaign.",
      priorities: [
        "Cut California's gas prices in half",
        "Cut income taxes for middle and upper earners",
        "Build housing on undeveloped open space",
        "End sanctuary state policies",
      ],
      stances: [
        "Suspend California's environmental regulations regime to drive down gas and electricity prices",
        "Open natural and undeveloped land for <mark>suburban single-family housing</mark>",
        "Eliminate California sanctuary state status; cooperate with ICE",
        "Reverse Newsom's late-term budget choices; freeze state hiring",
      ],
      strengths: [
        "<mark>Trump endorsement</mark> consolidates the GOP primary vote",
        "Sharp media presence from years on Fox; comfortable on the debate stage",
        "Outsider/entrepreneur framing in a state weary of insiders",
        "Tied for first in latest polling — has a genuine path to November",
      ],
      criticisms: [
        "Has never held elected office anywhere",
        "British accent and origin used (fairly or not) as proxy for cultural disconnection",
        "Climate-suspension agenda is wildly out of step with 60%+ Californian support for climate action",
        "<mark>Trump-coalition ceiling</mark>: very hard to grow past 25% in a general election",
      ],
      history: [
        { year: "2010", event: "Becomes senior policy adviser to UK PM David Cameron" },
        { year: "2012", event: "Departs UK government; emigrates to California" },
        { year: "2014", event: "Co-founds political crowdfunding platform Crowdpac" },
        { year: "2017", event: "Launches The Next Revolution on Fox News" },
        { year: "2023", event: "Fox News show ends as he prepares for political run" },
        { year: "2025", event: "Officially declares candidacy for California governor" },
        { year: "2026", event: "Receives Donald Trump endorsement" },
        { year: "May 5, 2026", event: "Describes Newsom's tenure in one word: 'Failed' on the CNN debate stage" },
      ],
      endorsements: [
        { category: "Elected Officials", name: "President Donald J. Trump" },
        { category: "Elected Officials", name: "Rep. Kevin McCarthy (former House Speaker)" },
        { category: "Advocacy & Industry", name: "Nisei Farmers League" },
        { category: "Advocacy & Industry", name: "Howard Jarvis Taxpayers Association (board members)" },
        { category: "Advocacy & Industry", name: "California Republican Party (state party)" },
        { category: "Local Leaders", name: "Orange County GOP Central Committee" },
        { category: "Local Leaders", name: "San Diego County GOP Central Committee" },
      ],
      voteForIf: [
        "You want a clean break from <mark>16 years of one-party rule</mark>",
        "Gas prices and the cost of fuel are your top concerns",
        "You support President Trump and want a California ally to him",
        "You believe California's regulatory regime is the root cause of its affordability crisis",
      ],
      bottomLine:
        "Hilton is the Trump-endorsed Republican: a former Fox News host and Cameron-era UK adviser pitching California as a state ruined by one-party rule. His program is <mark>suspend climate regulations, cut income taxes, end sanctuary state law, and build housing on undeveloped land</mark> — a clean break from the Newsom era. He has the charisma and earned media to run a real campaign and is tied for first in the latest polling. The fundamental ceiling is structural: California is 24% registered Republican, and a UK-born Trump ally has a hard math problem in November even if he wins the primary. He almost certainly makes the runoff; whether he can grow past 40% in a general is a different question entirely.",
      news: [
        {
          id: "hilton-n1",
          type: "social",
          source: "Donald J. Trump",
          title:
            "Steve Hilton will be a GREAT Governor of California. He's tough on crime, strong on the border, and will end the failed Newsom era. Total endorsement!",
          date: "2026-03-18T19:00:00Z",
          social: { platform: "Truth Social", handle: "realDonaldTrump" },
        },
        {
          id: "hilton-n2",
          type: "news",
          source: "CNN Politics",
          title: "Hilton calls Newsom's tenure 'Failed' in one-word debate question",
          excerpt:
            "The Republican frontrunner used his closing statements to argue California needs a clean break from sixteen years of one-party rule.",
          url: "https://www.cnn.com/2026/05/05/politics/takeaways-cnn-california-governor-debate",
          date: "2026-05-05T22:00:00Z",
        },
        {
          id: "hilton-n3",
          type: "social",
          source: "Steve Hilton",
          title:
            "California's gas prices are a policy choice. We can fix this on day one. End the regulations strangling refineries, and prices come down. Simple.",
          date: "2026-05-04T16:00:00Z",
          social: { platform: "X", handle: "SteveHiltonx" },
        },
        {
          id: "hilton-n4",
          type: "poll",
          source: "Emerson / Inside California Politics",
          title: "Hilton holds at 17–18%, leads GOP field",
          excerpt:
            "Steady polling makes Hilton the most likely Republican to advance to the November runoff. Bianco trails by 4 points but remains within reach.",
          date: "2026-05-04T13:00:00Z",
        },
      ],
      issues: {
        affordability: {
          stance: "Suspend regulations driving up gas, electric, and food prices; emergency permitting reform.",
          source: "Campaign site",
        },
        housing: {
          stance:
            "Open <mark>undeveloped natural land</mark> for suburban single-family construction; eliminate CEQA for housing projects.",
          source: "CalMatters",
        },
        economy: {
          stance: "Cut income taxes for middle and upper earners; phase down the top marginal rate.",
          source: "Campaign site",
        },
        climate: {
          stance:
            "<mark>Suspend California's climate regulations</mark> in their entirety; abandon the 2035 EV mandate; expand in-state oil and gas.",
          source: "Debate, May 5",
        },
        homelessness: {
          stance: "Mandatory treatment for the unhoused; legal liability for cities that don't clear encampments.",
          source: "Fox News commentary",
        },
        immigration: {
          stance: "<mark>End sanctuary state law</mark>; full cooperation with federal immigration enforcement.",
          source: "On record",
        },
        healthcare: {
          stance: "Roll back Medi-Cal expansion to undocumented adults; reduce Medi-Cal scope to citizens and LPRs.",
          source: "Campaign site",
        },
        education: {
          stance: "Universal school choice via vouchers; ban CRT and gender-identity instruction in K-12.",
          source: "Campaign site",
        },
        ai: {
          stance: "Light-touch state AI regulation; California should attract AI investment, not deter it.",
          source: "Campaign site",
        },
        abortion: {
          stance: "Personally pro-life; says he would not seek to roll back California's existing protections.",
          source: "Debate, May 5",
        },
        trump: {
          stance:
            "Endorsed by President Trump; promises full alignment on immigration, energy, and federal lands disputes.",
          source: "On record",
        },
        crime: {
          stance: "Full Prop 36 implementation; restore tough-on-crime DAs; reverse zero-bail policies.",
          source: "Campaign site",
        },
      },
    },

    // ===========================================================
    // CHAD BIANCO (R) — populist sheriff
    // ===========================================================
    {
      id: "bianco",
      name: "Chad Bianco",
      party: "Republican",
      headshot: wm("Chad_Bianco,_2025.jpg"),
      major: true,
      pollingStatus: "Top tier",
      pollingPct: 14,
      trend: "flat",
      currentRole: "Sheriff, Riverside County (since 2019)",
      pastRoles: [
        "Riverside County Sheriff's deputy and supervisor (1993–2018)",
        "President, California State Sheriffs' Association (2023)",
      ],
      background:
        "Bianco is a three-decade Riverside County deputy who unseated his boss to become sheriff in 2018. He has positioned himself as a populist law-and-order Republican to the right of Hilton, refusing during COVID to enforce mask mandates and earning a national profile. His campaign's central premise is that <mark>California's problems are downstream of bad governance</mark>, and that a sheriff has the temperament to clean it up.",
      priorities: [
        "Eliminate the state income tax and the gas tax",
        "Suspend state regulations across energy, housing, and environment",
        "Repeal sanctuary state law and partner with ICE",
        "Restore in-state oil and gas production",
      ],
      stances: [
        "Eliminate the state income tax and gas tax; cut state spending to match",
        "Boost in-state oil and gas extraction; <mark>suspend environmental review</mark> for energy projects",
        "Overturn SB 54 (sanctuary state); cooperate fully with ICE",
        "Hard-line public safety: mandatory minimums, full Prop 36 enforcement",
      ],
      strengths: [
        "<mark>Authentic California-grown</mark> Republican (vs. Hilton's UK origin)",
        "Has actually run a large law enforcement organization (4,000+ employees)",
        "Strong with rural and Inland Empire voters",
        "Genuine grassroots energy from the COVID-era resistance base",
      ],
      criticisms: [
        "<mark>Past ties to the Oath Keepers militia</mark> (paid dues; says he didn't know its full nature)",
        "Multiple jail-death investigations during his tenure as sheriff",
        "Refused to enforce COVID public health orders — disqualifying for many moderate voters",
        "Limited statewide name recognition outside Inland Empire",
      ],
      history: [
        { year: "1993", event: "Begins career as a Riverside County deputy" },
        { year: "2014", event: "Reported as having paid Oath Keepers dues" },
        { year: "2018", event: "Defeats incumbent sheriff in upset Republican primary" },
        { year: "2020", event: "Publicly refuses to enforce California COVID mask and gathering mandates" },
        { year: "2022", event: "Re-elected sheriff with 60%+ of the vote" },
        { year: "2025", event: "Declares candidacy for California governor" },
        { year: "May 5, 2026", event: "Clashes with Porter on debate stage; admits to using the word 'swindled'" },
      ],
      endorsements: [
        { category: "Elected Officials", name: "Sheriff Mike Boudreaux (Tulare County)" },
        { category: "Elected Officials", name: "Sheriff Robert Luna (LA County — neutral)" },
        { category: "Unions", name: "Peace Officers Research Association of California (PORAC)" },
        { category: "Advocacy & Industry", name: "California Republican Assembly" },
        { category: "Advocacy & Industry", name: "California State Sheriffs' Association (split)" },
        { category: "Local Leaders", name: "Riverside County GOP Central Committee" },
        { category: "Local Leaders", name: "San Bernardino County GOP" },
      ],
      voteForIf: [
        "You want a Republican who is to the right of Steve Hilton",
        "Public safety is your single most important issue",
        "You believe California's regulations and taxes are <mark>actively destroying the state</mark>",
        "You want a candidate who refused to enforce COVID mandates",
      ],
      bottomLine:
        "Bianco is the harder-edge, California-grown Republican alternative to Hilton: a three-decade Riverside County deputy who became sheriff in 2018, refused to enforce COVID public-health mandates, and has built a populist law-and-order campaign promising to <mark>eliminate the state income tax, suspend climate regulations, and repeal SB 54</mark>. He has actually run a 4,000-person organization and has authentic Inland Empire roots. His <mark>past Oath Keepers dues</mark> and the jail deaths during his tenure remain the central electability question — particularly with moderate suburban voters who may decide a November runoff. Real shot at the second slot if Hilton stumbles or conservative turnout overperforms.",
      news: [
        {
          id: "bianco-n1",
          type: "news",
          source: "CNN Politics",
          title: "Bianco admits using 'swindled' after initially denying it on debate stage",
          excerpt:
            "A heated exchange with moderators over a campaign-trail comment momentarily took focus off policy. Bianco walked it back later in the debate.",
          url: "https://www.cnn.com/2026/05/05/politics/takeaways-cnn-california-governor-debate",
          date: "2026-05-05T22:30:00Z",
        },
        {
          id: "bianco-n2",
          type: "social",
          source: "Chad Bianco",
          title:
            "California is broken. Sacramento can't fix what Sacramento broke. We need a sheriff's mindset — find what's not working, fix it, hold people accountable.",
          date: "2026-05-04T19:00:00Z",
          social: { platform: "X", handle: "ChadBianco" },
        },
        {
          id: "bianco-n3",
          type: "endorsement",
          source: "PORAC",
          title: "Peace Officers Research Association of California endorses Bianco",
          excerpt:
            "California's largest law enforcement union backs the Riverside County sheriff, citing his three-decade career and tough-on-crime platform.",
          date: "2026-02-11T18:00:00Z",
        },
      ],
      issues: {
        affordability: {
          stance: "Eliminate the gas tax and income tax. Cost of living falls when government cost falls.",
          source: "Campaign site",
        },
        housing: {
          stance: "End CEQA review for housing; allow rural and exurban single-family expansion.",
          source: "CalMatters",
        },
        economy: {
          stance:
            "<mark>Eliminate the state income tax</mark>; replace lost revenue with deep spending cuts and broadened sales base.",
          source: "Campaign site",
        },
        climate: {
          stance: "Suspend climate regulations; restart in-state oil and gas leasing; abandon EV mandate.",
          source: "Campaign site",
        },
        homelessness: {
          stance: "Mandatory shelter or jail for encampment violators; treat addiction as a criminal-justice issue.",
          source: "Campaign site",
        },
        immigration: {
          stance: "Repeal SB 54. <mark>Active state cooperation with ICE</mark>.",
          source: "On record",
        },
        healthcare: {
          stance: "Roll back undocumented Medi-Cal eligibility; let the federal market set policy.",
          source: "Campaign site",
        },
        education: {
          stance: "Universal vouchers; ban gender-identity curriculum; restore parent notification rules.",
          source: "Campaign site",
        },
        ai: {
          stance: "No new state AI regulation; let federal policy lead.",
          source: "Campaign site",
        },
        abortion: {
          stance: "Personally pro-life; would not move to alter California's existing constitutional protection.",
          source: "On record",
        },
        trump: {
          stance: "Aligned with Trump on immigration and energy; has not been endorsed by Trump.",
          source: "On record",
        },
        crime: {
          stance:
            "Mandatory minimums; full Prop 36; reverse zero-bail and end progressive prosecutor experiments.",
          source: "Campaign site",
        },
      },
    },

    // ===========================================================
    // KATIE PORTER (D) — early frontrunner, now fighting back
    // ===========================================================
    {
      id: "porter",
      name: "Katie Porter",
      party: "Democratic",
      headshot: wm("Katie_Porter,_official_portrait,_116th_Congress.jpg"),
      major: true,
      pollingStatus: "Competitive",
      pollingPct: 10,
      trend: "down",
      currentRole: "Professor of Law, UC Irvine",
      pastRoles: [
        "U.S. Representative, CA-47/45 (2019–2025)",
        "California state monitor, National Mortgage Settlement (2012–2015)",
        "Senior counsel, U.S. Senate Banking Committee staff (Warren mentee)",
      ],
      background:
        "Porter is a consumer-protection law professor who flipped a longtime Republican Orange County congressional seat in 2018 and held it through 2024. She is mentored by Senator Elizabeth Warren and built a national profile by <mark>grilling executives with a whiteboard</mark> in committee hearings. She entered 2026 as the Democratic frontrunner — but lost ground after 2024 video surfaced of her yelling at a staffer, and is now fighting to recover.",
      priorities: [
        "Cut taxes for middle-income Californians; raise corporate taxes",
        "Build dense, transit-oriented housing at scale",
        "Consumer protection from corporate price gouging",
        "Restore competence and accountability to Sacramento",
      ],
      stances: [
        "Tax shift: lower rates on the middle class, higher rates on corporations",
        "Aggressive <mark>upzoning near transit</mark>; conditional state aid for cities that block housing",
        "Defend reproductive rights as constitutional bedrock; expand provider supply",
        "Climate ambition with affordability lens — keep the targets, fix the implementation",
      ],
      strengths: [
        "<mark>Strongest small-dollar fundraising</mark> of any Democrat in the field",
        "Best debater on the Democratic side; sharpest on policy detail",
        "Built-in suburban, college-educated woman base — Newsom's coalition",
        "Earned media advantage from years of viral oversight clips",
      ],
      criticisms: [
        "2024 viral video of her <mark>yelling at a campaign staffer</mark> rebuilt the 'temperament' narrative",
        "Lost statewide once already — finished third in 2024 U.S. Senate primary",
        "Has had to repeatedly apologize for staff treatment — narrative drag",
        "Polling has slipped from clear leader to fifth in latest Emerson",
      ],
      history: [
        { year: "2002", event: "Graduates Harvard Law, where she studies under Elizabeth Warren" },
        { year: "2012", event: "Appointed CA monitor for National Mortgage Settlement by AG Harris" },
        { year: "2018", event: "Flips Orange County's CA-45, defeating GOP incumbent Mimi Walters" },
        { year: "2020", event: "Re-elected; viral whiteboard hearings build national profile" },
        { year: "2023", event: "Declares candidacy for U.S. Senate; finishes third in March 2024 primary" },
        { year: "2024", event: "Video of yelling at staffer surfaces; declines to seek House re-election" },
        { year: "2025", event: "Enters governor's race; immediately polls as frontrunner" },
        { year: "May 5, 2026", event: "Frames male rivals as 'boys bullying and bickering' on debate stage" },
      ],
      endorsements: [
        { category: "Elected Officials", name: "Sen. Elizabeth Warren (D–MA)" },
        { category: "Elected Officials", name: "Rep. Mark Takano (D–CA)" },
        { category: "Elected Officials", name: "Rep. Mike Levin (D–CA)" },
        { category: "Elected Officials", name: "Rep. Sara Jacobs (D–CA)" },
        { category: "Unions", name: "Teamsters California" },
        { category: "Unions", name: "SEIU California" },
        { category: "Advocacy & Industry", name: "EMILYs List" },
        { category: "Advocacy & Industry", name: "California Environmental Voters" },
        { category: "Local Leaders", name: "Orange County Democratic Party" },
        { category: "Local Leaders", name: "Mayor Farrah Khan (Irvine)" },
      ],
      voteForIf: [
        "You want a governor who will <mark>fight corporations on price-gouging</mark>",
        "Housing is your #1 issue and you support density",
        "You want California's first woman governor",
        "You voted for her in 2018 and want to give her another shot",
      ],
      bottomLine:
        "Porter is the consumer-protection law professor and former Orange County Congresswoman who built her national brand grilling executives with a whiteboard. Her platform is <mark>cut middle-class taxes, raise corporate ones, build dense transit-oriented housing, and treat climate goals as fixed</mark>. She entered the cycle as the Democratic frontrunner but has slipped after a 2024 video of her yelling at a staffer revived the temperament narrative — and she's already lost one statewide race (2024 Senate). Her ceiling is high if suburban women consolidate; her floor is the same temperament question that has dogged her for two years. <mark>If she stabilizes at 12–15% and Steyer/Thurmond fade</mark>, she's the most natural Democratic candidate to make the runoff. If she keeps slipping, this is a story of how a frontrunner unwinds.",
      news: [
        {
          id: "porter-n1",
          type: "news",
          source: "CNN Politics",
          title: "Porter frames male rivals as 'boys bullying and bickering' on debate stage",
          excerpt:
            "Pivoting from the temperament narrative that has dogged her campaign, Porter sought to recast attacks on her as gendered piling-on by the other candidates.",
          url: "https://www.cnn.com/2026/05/05/politics/takeaways-cnn-california-governor-debate",
          date: "2026-05-05T22:30:00Z",
        },
        {
          id: "porter-n2",
          type: "social",
          source: "Katie Porter",
          title:
            "Corporations don't get to write our housing rules. Voters do. Tonight, I'll show what an oversight-driven governor looks like — receipts, not vibes.",
          date: "2026-05-05T17:30:00Z",
          social: { platform: "X", handle: "KatiePorterOC" },
        },
        {
          id: "porter-n3",
          type: "endorsement",
          source: "Teamsters California",
          title: "Teamsters California endorses Katie Porter",
          excerpt:
            "The state's largest private-sector union cited Porter's record on consumer protection, anti-monopoly enforcement, and labor rights.",
          date: "2026-03-04T15:00:00Z",
        },
        {
          id: "porter-n4",
          type: "poll",
          source: "Berkeley IGS",
          title: "Porter slips from frontrunner status as Bianco overtakes in latest poll",
          excerpt:
            "The March IGS poll showed Bianco overtaking Porter as nominal leader, with 44% of voters undecided. Porter's slide began after the leaked staff-yelling video resurfaced.",
          date: "2026-03-28T11:00:00Z",
        },
      ],
      issues: {
        affordability: {
          stance: "Cut taxes for middle-income earners; pursue corporate price-gouging in court.",
          source: "Campaign site",
        },
        housing: {
          stance:
            "Aggressive <mark>upzoning near transit</mark>; tie state housing aid to local production targets; CEQA reform for infill.",
          source: "Campaign site",
        },
        economy: {
          stance: "Lower middle-class income taxes; raise corporate rates and close tax-shelter loopholes.",
          source: "CalMatters",
        },
        climate: {
          stance: "Keep the climate targets; fix implementation. Refuse to roll back the 2035 EV mandate.",
          source: "Debate, May 5",
        },
        homelessness: {
          stance: "Build supportive housing at scale; reform conservatorship law where mental illness drives unhousing.",
          source: "Campaign site",
        },
        immigration: {
          stance: "Defend SB 54; expand legal aid; oppose ICE entry without judicial warrant.",
          source: "Voting record",
        },
        healthcare: {
          stance: "Defend Medi-Cal; pursue prescription-drug price negotiation at the state level.",
          source: "Voting record",
        },
        education: {
          stance: "Restore Prop 98 floor; expand TK and after-school care; oppose universal vouchers.",
          source: "Campaign site",
        },
        ai: {
          stance:
            "Strong state AI regulation — <mark>worker-displacement protections, training-data transparency</mark>, deepfake liability.",
          source: "Campaign site",
        },
        abortion: {
          stance: "Constitutional protection is a floor, not a ceiling; expand provider supply and patient travel funds.",
          source: "On record",
        },
        trump: {
          stance: "Resistance posture: California as the leading state-level counterweight to federal overreach.",
          source: "Campaign site",
        },
        crime: {
          stance: "Implement Prop 36; oppose mandatory-minimum expansion; invest in violence-prevention programs.",
          source: "Campaign site",
        },
      },
    },

    // ===========================================================
    // TOM STEYER (D) — climate/wealth-tax billionaire
    // ===========================================================
    {
      id: "steyer",
      name: "Tom Steyer",
      party: "Democratic",
      headshot: wm("NYCW_2025_-_Tom_Steyer_05_(cropped).jpg"),
      major: true,
      pollingStatus: "Competitive",
      pollingPct: 14,
      trend: "down",
      currentRole: "Founder, Galvanize Climate Solutions",
      pastRoles: [
        "Founder, NextGen America (climate political organization)",
        "Founder, Farallon Capital Management (1986–2012)",
        "U.S. presidential candidate (2020 Democratic primary)",
      ],
      background:
        "Steyer is a billionaire climate investor who built and divested from Farallon Capital, then launched NextGen America to drive young-voter turnout on climate. He <mark>self-funded a 2020 presidential bid</mark> that ended after South Carolina, and now runs Galvanize Climate Solutions. His California governor campaign blends climate ambition with a populist tax message — and is bankrolled at a level no other Democrat in the field can match.",
      priorities: [
        "<mark>Break investor-owned utility monopolies</mark>; rate relief through public alternatives",
        "Reform Prop 13 for commercial property; raise revenue for housing and schools",
        "Aggressive climate action — keep the 2035 mandate, accelerate where possible",
        "AI usage fee to fund worker transition",
      ],
      stances: [
        "Public alternatives to PG&E and SCE; <mark>break the IOU monopoly</mark>",
        "Raise property taxes on commercial properties only (split-roll)",
        "Statewide single-payer healthcare advocacy",
        "Aggressive climate action; reject any rollback of the 2035 EV mandate",
      ],
      strengths: [
        "Unlimited self-funding capacity",
        "Genuinely deep policy infrastructure on climate and tax",
        "Endorsed by California Nurses Association — most powerful single-issue endorsement on the Democratic left",
        "Polling at 14% — within striking distance of the runoff",
      ],
      criticisms: [
        "Failed 2020 presidential bid is a credibility shadow",
        "<mark>Past investments in fossil fuels and private prisons</mark> (since divested) used as recurring attack",
        "Self-funded billionaires running for office face structural skepticism",
        "Has never held elected office",
      ],
      history: [
        { year: "1986", event: "Founds Farallon Capital Management" },
        { year: "2012", event: "Steps down from Farallon to focus on climate advocacy" },
        { year: "2013", event: "Launches NextGen Climate / NextGen America" },
        { year: "2018", event: "Funds successful 'Need to Impeach' campaign against Trump" },
        { year: "2020", event: "Ends presidential primary bid after South Carolina" },
        { year: "2021", event: "Co-founds Galvanize Climate Solutions" },
        { year: "2025", event: "Declares candidacy for California governor" },
        { year: "May 5, 2026", event: "Describes Newsom in one word: 'Progressive' on debate stage" },
      ],
      endorsements: [
        { category: "Unions", name: "California Nurses Association" },
        { category: "Unions", name: "California Teachers Association (split)" },
        { category: "Advocacy & Industry", name: "California Environmental Voters" },
        { category: "Advocacy & Industry", name: "350.org Action" },
        { category: "Advocacy & Industry", name: "Climate Hawks Vote" },
        { category: "Advocacy & Industry", name: "NextGen America (his own org)" },
        { category: "Advocacy & Industry", name: "Sierra Club California (split)" },
        { category: "Local Leaders", name: "San Francisco Berniecrats" },
        { category: "Local Leaders", name: "Alameda County Green Party (cross-pollination)" },
      ],
      voteForIf: [
        "Climate is your #1 issue and you want a governor who will accelerate, not decelerate",
        "You want to <mark>break utility monopolies</mark> and pursue split-roll Prop 13 reform",
        "You want a candidate who can self-fund a head-to-head with a Republican",
        "You support single-payer healthcare advocacy from the governor's office",
      ],
      bottomLine:
        "Steyer is the climate-investor billionaire whose 2020 presidential bid ended in South Carolina but who can self-fund a head-to-head against any Republican. His platform is <mark>break investor-owned utility monopolies, split-roll Prop 13 for commercial property, statewide single-payer advocacy, and an AI usage fee to fund worker transition</mark> — the most economic-populist platform in the field. The California Nurses Association endorsement is the most powerful single-issue endorsement on the Democratic left, and his self-funding capacity means he can stay competitive through Election Day. The risk: a billionaire running on a wealth tax is a credibility paradox, and his past fossil-fuel and private-prison investments (since divested) keep coming back as attacks. <mark>If young and climate-left voters consolidate behind him</mark>, he advances; if they split between him, Porter, and Thurmond, none of them do.",
      issues: {
        affordability: {
          stance: "Public utility alternatives to drive ratepayer relief; AI usage fee to fund worker transition.",
          source: "Campaign site",
        },
        housing: {
          stance:
            "Tie state housing dollars to <mark>commercial-property tax reform</mark>; build affordable housing at scale.",
          source: "Campaign site",
        },
        economy: {
          stance: "Split-roll Prop 13 (commercial only); raise wealth-adjacent levies; invest in green economy.",
          source: "CalMatters",
        },
        climate: {
          stance: "<mark>Accelerate climate goals</mark>; reject any rollback of the EV mandate; expand offshore wind.",
          source: "Debate, May 5",
        },
        homelessness: {
          stance: "Housing-First at scale; expand Project Homekey; oppose criminalization-led approaches.",
          source: "Campaign site",
        },
        immigration: {
          stance: "Defend SB 54; expand legal-aid funding; provide state DACA-equivalent benefits.",
          source: "Campaign site",
        },
        healthcare: {
          stance: "Move California toward single-payer; expand Medi-Cal; codify reproductive rights protections.",
          source: "Campaign site",
        },
        education: {
          stance: "Increase per-pupil funding; expand community college free tuition; oppose vouchers.",
          source: "Campaign site",
        },
        ai: {
          stance: "<mark>Statewide AI usage fee</mark> to fund a worker-transition trust; mandatory model audits.",
          source: "Campaign site",
        },
        abortion: {
          stance: "Aggressive expansion of provider supply; state travel funds for out-of-state patients.",
          source: "On record",
        },
        trump: {
          stance: "Sees Trump 2.0 as an existential threat; will lead state-level resistance.",
          source: "Campaign site",
        },
        crime: {
          stance: "Invest in prevention and re-entry; implement Prop 36 with treatment, not just incarceration.",
          source: "Campaign site",
        },
      },
    },

    // ===========================================================
    // ANTONIO VILLARAIGOSA (D) — moderate, ex-LA mayor
    // ===========================================================
    {
      id: "villaraigosa",
      name: "Antonio Villaraigosa",
      party: "Democratic",
      headshot: wm("AntonioVillaraigosaHWOFMay2013.jpg"),
      major: true,
      pollingStatus: "Trailing",
      pollingPct: 5,
      trend: "down",
      currentRole: "Candidate; private consulting",
      pastRoles: [
        "Mayor of Los Angeles (2005–2013)",
        "Speaker, California State Assembly (1998–2000)",
        "California State Assemblymember, 45th district (1994–2000)",
        "Co-chair, Hillary Clinton 2008 presidential campaign",
      ],
      background:
        "Villaraigosa was a Latino civil-rights and labor organizer who became Speaker of the California Assembly, then served two terms as mayor of Los Angeles. He was the first Latino mayor of LA in 130+ years. He <mark>ran for governor in 2018</mark> and finished third in the primary, eliminated by the top-two rule. This is his second try, running as the most centrist credible Democrat in the field.",
      priorities: [
        "Public safety and police staffing",
        "Transportation and infrastructure investment",
        "Pragmatic climate — protect affordability",
        "Hollywood film tax credit expansion",
      ],
      stances: [
        "<mark>Skeptical of aggressive climate timelines</mark>; supports oil/gas as a 'transition fuel'",
        "Expand police staffing; restore tough-on-crime DA support",
        "Aggressive expansion of Hollywood film tax credit; uncapped above-and-below-the-line",
        "Pragmatic immigration: defend SB 54 but expand state-federal coordination on serious crime",
      ],
      strengths: [
        "<mark>Most experienced executive</mark> in the Democratic field — ran the country's 2nd-largest city for 8 years",
        "Building & Construction Trades + PORAC support: rare labor-and-cops coalition",
        "Latino base in Los Angeles County, the largest single voting bloc in the state",
        "Centrist lane is currently uncontested",
      ],
      criticisms: [
        "Polling at 5% — has not been able to break through despite name recognition",
        "Mayoral tenure remembered for <mark>infidelity scandal and budget shortfalls</mark>",
        "Lost the 2018 governor's primary; second statewide loss would be career-ending",
        "Climate skepticism alienates the progressive left",
      ],
      history: [
        { year: "1994", event: "Elected to California State Assembly" },
        { year: "1998", event: "Becomes Speaker of the California State Assembly" },
        { year: "2005", event: "Elected Mayor of Los Angeles, first Latino mayor in 130+ years" },
        { year: "2008", event: "Co-chairs Hillary Clinton's presidential primary campaign" },
        { year: "2013", event: "Steps down as LA Mayor under term limits" },
        { year: "2018", event: "Runs for California governor; finishes third in primary" },
        { year: "2025", event: "Declares second candidacy for governor" },
        { year: "May 5, 2026", event: "Calls Hollywood film tax credit fight 'an existential election' on debate stage" },
      ],
      endorsements: [
        { category: "Unions", name: "Peace Officers Research Association of California (PORAC)" },
        { category: "Unions", name: "State Building & Construction Trades Council of California" },
        { category: "Unions", name: "Laborers' International Union (LiUNA) — California" },
        { category: "Unions", name: "LA County Federation of Labor (split)" },
        { category: "Advocacy & Industry", name: "Latino Coalition of Los Angeles" },
        { category: "Advocacy & Industry", name: "LA Chamber of Commerce" },
        { category: "Local Leaders", name: "LA County Supervisor Hilda Solis" },
        { category: "Local Leaders", name: "Former LA Mayor Eric Garcetti" },
      ],
      voteForIf: [
        "You want a Democrat who has <mark>actually run a major city</mark>",
        "You think Newsom and the Democratic legislature have been too progressive",
        "Public safety, infrastructure, and Hollywood matter most to you",
        "You want a Latino governor with deep LA County roots",
      ],
      bottomLine:
        "Villaraigosa is the most experienced executive in the Democratic field — Speaker of the Assembly, then two-term LA Mayor, then 2018 governor's primary loser. He's running again as the centrist alternative: <mark>more police, oil-and-gas as a transition fuel, skepticism of aggressive climate timelines, uncapped Hollywood film tax credit, and a labor-and-cops coalition</mark> nobody else in the field can build. The problem is the lane: California Democratic primary voters in 2026 don't seem to want a centrist, and he's stuck at 5%. His mayoral years are remembered as much for the infidelity scandal and budget shortfalls as for the LA Live era. <mark>He likely needs movement in the final week</mark> to make the runoff. Without it, this is a goodbye run.",
      issues: {
        affordability: {
          stance: "Targeted gas-tax holiday; permitting reform to lower construction costs.",
          source: "Campaign site",
        },
        housing: {
          stance:
            "Build housing at all levels — single-family, multi-family, and affordable. Reject the 'density-only' framing.",
          source: "Campaign site",
        },
        economy: {
          stance: "Maintain current tax structure; oppose split-roll. Targeted business tax credits.",
          source: "CalMatters",
        },
        climate: {
          stance:
            "<mark>Skeptical of aggressive climate goals</mark>. Supports a moratorium on new climate regulations and oil/gas as a transition fuel.",
          source: "CalMatters",
        },
        homelessness: {
          stance: "Project-Roomkey-style scale; expanded conservatorship; mandatory treatment for severely mentally ill.",
          source: "Campaign site",
        },
        immigration: {
          stance: "Defend SB 54 but expand state-federal coordination on serious-crime offenders.",
          source: "On record",
        },
        healthcare: {
          stance: "Defend Medi-Cal; expand provider supply; pragmatic on undocumented coverage scope.",
          source: "Campaign site",
        },
        education: {
          stance: "Restore Prop 98 floor; expand TK; targeted charter authorization with accountability.",
          source: "Campaign site",
        },
        ai: {
          stance: "Light-touch state AI policy; <mark>California should remain the AI capital</mark>.",
          source: "Campaign site",
        },
        abortion: {
          stance: "Defend constitutional protections; expand provider supply.",
          source: "On record",
        },
        trump: {
          stance: "Will defend California where federal action threatens — but emphasizes pragmatic engagement.",
          source: "Campaign site",
        },
        crime: {
          stance:
            "Expand police staffing; full Prop 36; restore traditional DA approach. Built coalition with PORAC.",
          source: "Campaign site",
        },
      },
    },

    // ===========================================================
    // MATT MAHAN (D) — San Jose mayor, fiscal moderate
    // ===========================================================
    {
      id: "mahan",
      name: "Matt Mahan",
      party: "Democratic",
      headshot: wm("Matt_Mahan_Farmer's_Market_4_April_2026_(cropped).jpg"),
      major: true,
      pollingStatus: "Trailing",
      pollingPct: 7,
      trend: "up",
      currentRole: "Mayor of San Jose (2023–present)",
      pastRoles: [
        "San Jose City Councilmember, District 10 (2020–2022)",
        "Founder/CEO, Brigade Media (civic tech startup)",
      ],
      background:
        "Mahan is a Harvard-educated civic-tech entrepreneur who became San Jose mayor in 2023 on a public-safety and homelessness platform. He <mark>ties leader pay to performance metrics</mark> and has emphasized fiscal moderation in a city facing chronic budget pressure. His governor's campaign positions him as the youngest, most pragmatic Democrat — a generational handoff candidate.",
      priorities: [
        "Reduce street homelessness via mass shelter (tiny homes)",
        "Tie government leader pay to outcome metrics",
        "Fiscal moderation — oppose new broad-based taxes",
        "Suspend the gas tax as immediate affordability relief",
      ],
      stances: [
        "Open <mark>tiny-home shelter sites at scale</mark>; condition aid on outcomes",
        "Oppose new broad-based taxes; temporary gas-tax suspension",
        "Pragmatic climate — keep the goals, modernize timelines",
        "Strong on public safety — increase officer staffing in major cities",
      ],
      strengths: [
        "Mayor of <mark>California's third-largest city</mark> — concrete executive record",
        "Generational candidate (40s) in a field of veterans",
        "Civic-tech background appeals to Bay Area moderates",
        "Posted modest polling bump after April debate appearances",
      ],
      criticisms: [
        "Limited statewide name recognition",
        "Tiny-home homelessness model has produced <mark>mixed outcomes</mark> in San Jose",
        "Anti-tax posture out of step with Democratic primary electorate",
        "Hasn't broken 8% in any major poll",
      ],
      history: [
        { year: "2007", event: "Graduates Harvard; becomes a Teach for America corps member" },
        { year: "2014", event: "Co-founds Brigade Media, civic-tech startup later acquired by Pinterest" },
        { year: "2020", event: "Elected to San Jose City Council, District 10" },
        { year: "2022", event: "Wins San Jose mayoral race" },
        { year: "2023", event: "Begins term as Mayor of San Jose" },
        { year: "2024", event: "Implements pay-for-performance ordinance for executive staff" },
        { year: "2025", event: "Declares candidacy for governor" },
        { year: "May 5, 2026", event: "Picks 'Russell Crowe in Gladiator' for the celebrity-biopic question" },
      ],
      endorsements: [
        { category: "Elected Officials", name: "Sam Liccardo (former San Jose Mayor)" },
        { category: "Elected Officials", name: "Mayor Lily Mei (Fremont)" },
        { category: "Elected Officials", name: "Mayor Otto Lee (Sunnyvale)" },
        { category: "Advocacy & Industry", name: "Thrive LA" },
        { category: "Advocacy & Industry", name: "Silicon Valley Leadership Group" },
        { category: "Advocacy & Industry", name: "San Jose Mayor's Civic Innovation Coalition" },
        { category: "Local Leaders", name: "Santa Clara County moderate Democratic clubs" },
      ],
      voteForIf: [
        "You want a Democrat who is <mark>fiscally moderate</mark>",
        "You think Newsom and the legislature have been too progressive on homelessness",
        "You want a generational handoff candidate",
        "Pay-for-performance government appeals to you",
      ],
      bottomLine:
        "Mahan is the youngest credible Democrat in the field: a Harvard-educated civic-tech entrepreneur turned San Jose mayor, running on <mark>fiscal moderation, mass tiny-home shelter for homelessness, no new taxes, and pay-for-performance accountability</mark>. His tenure in San Jose is a real executive record — but tiny-home outcomes are mixed and his anti-tax posture is out of step with the Democratic primary base. He's the candidate Bay Area moderates and Silicon Valley pragmatists are quietly rooting for. The numbers don't show a 2026 runoff path: he's stuck at 7% and hasn't broken through despite four months of debate appearances. <mark>Almost certainly a long shot this cycle</mark> — but well-positioned to be a top-tier candidate in a future race.",
      issues: {
        affordability: {
          stance: "Suspend the gas tax; <mark>tie aid to outcome metrics</mark> to drive efficiency.",
          source: "Campaign site",
        },
        housing: {
          stance: "Build at all levels; condition state housing aid on local production benchmarks.",
          source: "Campaign site",
        },
        economy: {
          stance: "Oppose new broad-based taxes; pursue efficiency through outcome metrics.",
          source: "CalMatters",
        },
        climate: {
          stance: "Keep the targets; modernize the timelines where affordability is at risk.",
          source: "Campaign site",
        },
        homelessness: {
          stance:
            "<mark>Mass tiny-home shelter sites</mark>; mandatory shelter use; no ban on encampment enforcement.",
          source: "On record",
        },
        immigration: {
          stance: "Defend SB 54; expand state-federal coordination on serious-crime offenders.",
          source: "Campaign site",
        },
        healthcare: {
          stance: "Defend Medi-Cal; pragmatic on undocumented coverage scope.",
          source: "Campaign site",
        },
        education: {
          stance: "Outcome-based funding; expand career-tech pathways; pragmatic on charters.",
          source: "Campaign site",
        },
        ai: {
          stance: "California should set workable AI rules — neither preempt federal nor over-regulate.",
          source: "Campaign site",
        },
        abortion: {
          stance: "Defend constitutional protections.",
          source: "On record",
        },
        trump: {
          stance: "Stand up to federal overreach where it harms California; partner where it helps.",
          source: "Campaign site",
        },
        crime: {
          stance: "Increase police staffing; full Prop 36 implementation; invest in violence prevention.",
          source: "Campaign site",
        },
      },
    },

    // ===========================================================
    // TONY THURMOND (D) — Sup of Public Instruction, leftmost
    // ===========================================================
    {
      id: "thurmond",
      name: "Tony Thurmond",
      party: "Democratic",
      headshot: wm("Assemblymember_Tony_Thurmond_(cropped).jpg"),
      major: true,
      pollingStatus: "Trailing",
      pollingPct: 4,
      trend: "flat",
      currentRole: "California Superintendent of Public Instruction (2019–present)",
      pastRoles: [
        "California State Assemblymember, 15th district (2014–2018)",
        "Richmond, CA City Council and West Contra Costa Unified School Board",
        "Social worker, group-home and mental-health programs",
      ],
      background:
        "Thurmond is the elected California Superintendent of Public Instruction, a former Bay Area Assemblymember, and a former social worker who grew up in foster care. He is the <mark>only major candidate proposing a one-time billionaire wealth tax</mark> to fund Medi-Cal and education. His campaign is positioned to the left of the field, anchored in education and economic justice.",
      priorities: [
        "One-time billionaire asset tax to fund Medi-Cal and education",
        "Open school district land for affordable housing",
        "Tax credits for low-income working families",
        "Strengthen ethnic studies and civic education",
      ],
      stances: [
        "<mark>One-time billionaire wealth tax</mark> for Medi-Cal and schools",
        "Convert surplus school district land to affordable housing",
        "Refundable state EITC expansion",
        "Defend ethnic studies and aggressive social-justice curriculum",
      ],
      strengths: [
        "The only candidate with a <mark>statewide elected mandate</mark> on K-12",
        "Endorsed by California Faculty Association and National Association of Social Workers",
        "Authentic biography (foster care, social worker) appeals to base",
        "Clearest left-economic-populist message in the field",
      ],
      criticisms: [
        "Polling at 4% — has not broken through statewide despite the Superintendent platform",
        "<mark>SPI tenure</mark> has drawn criticism for slow handling of post-COVID learning loss",
        "Wealth tax is constitutionally and politically dubious",
        "Out-fundraised by every other major Democrat",
      ],
      history: [
        { year: "1990s", event: "Career as social worker, mental health and youth services" },
        { year: "2008", event: "Elected to West Contra Costa school board" },
        { year: "2014", event: "Elected to California State Assembly, 15th district" },
        { year: "2018", event: "Elected California Superintendent of Public Instruction" },
        { year: "2022", event: "Re-elected as State Superintendent" },
        { year: "2024", event: "Declares candidacy for governor" },
        { year: "May 5, 2026", event: "Did not qualify for the CNN debate stage (under 5% in qualifying polls)" },
      ],
      endorsements: [
        { category: "Elected Officials", name: "Asm. Mia Bonta (D–Oakland)" },
        { category: "Elected Officials", name: "Asm. Lori Wilson (D–Suisun City)" },
        { category: "Unions", name: "California Faculty Association (split)" },
        { category: "Unions", name: "California Federation of Teachers (split)" },
        { category: "Unions", name: "National Association of Social Workers — California" },
        { category: "Unions", name: "Contra Costa Labor Council" },
        { category: "Advocacy & Industry", name: "Black Women Organized for Political Action (BWOPA)" },
        { category: "Local Leaders", name: "Mayor Loella Haskew (Walnut Creek — split)" },
      ],
      voteForIf: [
        "You want a governor who will <mark>tax billionaires</mark>",
        "Education is your single most important issue",
        "You want a candidate from the foster-care system who lived the policy he writes",
        "You want California's first Black male governor",
      ],
      bottomLine:
        "Thurmond is the elected California Superintendent of Public Instruction, a former Bay Area Assemblymember, and the only major candidate proposing a <mark>one-time billionaire wealth tax to fund Medi-Cal and schools</mark>. He grew up in foster care, became a social worker, then built a political career anchored in education and economic justice. He's the leftmost candidate in the field — and at 4%, he's also the most under-resourced. The wealth tax is constitutionally and politically dubious; his SPI tenure has drawn fire over post-COVID learning-loss handling. <mark>Likely positions himself for a future statewide race</mark> rather than a 2026 runoff. This campaign is a values-and-message exercise — and a real signal of where the Democratic left wants the state to go next.",
      issues: {
        affordability: {
          stance: "Refundable state EITC; tax-credit expansion for low-income families.",
          source: "Campaign site",
        },
        housing: {
          stance: "<mark>Convert surplus school district land</mark> to affordable housing; expand Project Homekey.",
          source: "Campaign site",
        },
        economy: {
          stance:
            "<mark>One-time billionaire asset tax</mark> to fund Medi-Cal and schools; expand EITC; oppose corporate tax cuts.",
          source: "CalMatters",
        },
        climate: {
          stance: "Aggressive climate ambition; partner with environmental-justice organizers in disadvantaged areas.",
          source: "Campaign site",
        },
        homelessness: {
          stance: "Housing-First at scale; school-land conversion; expand mental-health workforce.",
          source: "Campaign site",
        },
        immigration: {
          stance: "Defend SB 54; expand legal aid; full schools sanctuary.",
          source: "On record",
        },
        healthcare: {
          stance: "Fund Medi-Cal expansion through billionaire asset tax; advance single-payer.",
          source: "Campaign site",
        },
        education: {
          stance:
            "Increase per-pupil funding; <mark>defend ethnic studies</mark>; oppose vouchers; expand teacher pipelines.",
          source: "On record",
        },
        ai: {
          stance: "Strong AI guardrails in K-12; protect students from data exploitation.",
          source: "Campaign site",
        },
        abortion: {
          stance: "Constitutional protection floor; expand provider supply and patient travel funds.",
          source: "On record",
        },
        trump: {
          stance: "Resistance posture; lead K-12 fights against federal Title IX and Title VI rollbacks.",
          source: "Campaign site",
        },
        crime: {
          stance: "Implement Prop 36; invest in prevention and re-entry; oppose mandatory-minimum expansion.",
          source: "Campaign site",
        },
      },
    },

    // ===========================================================
    // ERIC SWALWELL (D) — SUSPENDED
    // ===========================================================
    {
      id: "swalwell",
      name: "Eric Swalwell",
      party: "Democratic",
      major: true,
      pollingStatus: "Suspended (Apr 12, 2026)",
      campaignSuspended: {
        date: "April 12, 2026",
        note: "Suspended after CNN and the San Francisco Chronicle reported allegations from four women describing sexual misconduct, including one allegation of rape. Senators Schiff and Gallego withdrew their endorsements within 48 hours.",
      },
      currentRole: "U.S. Representative, CA-14 (suspended gubernatorial campaign)",
      pastRoles: [
        "U.S. Representative, CA-14/15 (2013–present)",
        "Trump impeachment manager (2021)",
        "Member, House Intelligence and Judiciary committees",
        "Alameda County Deputy District Attorney",
      ],
      background:
        "Swalwell is a Bay Area congressman, former impeachment manager, and 2020 presidential candidate who entered the governor's race in 2025 and quickly emerged as the Democratic frontrunner. <mark>His campaign collapsed in mid-April 2026</mark> after CNN and the SF Chronicle published allegations of sexual misconduct from four women. He suspended his campaign on April 12 but his name will appear on printed ballots.",
      priorities: ["[Campaign suspended]"],
      stances: ["[Campaign suspended]"],
      strengths: [
        "Strongest Democratic polling pre-collapse",
        "National security profile from impeachment management",
      ],
      criticisms: [
        "<mark>Allegations from four women</mark> ranging from inappropriate messages to one alleged rape",
        "Major endorsements pulled within 48 hours of the reporting",
        "Campaign infrastructure dismantled in one week",
      ],
      history: [
        { year: "2013", event: "Elected to U.S. House from Bay Area's 14th district" },
        { year: "2019", event: "Briefly runs for U.S. President; withdraws" },
        { year: "2021", event: "Serves as Trump impeachment manager" },
        { year: "2025", event: "Declares candidacy for California governor" },
        { year: "Apr 10, 2026", event: "CNN and SF Chronicle publish allegations from four women" },
        { year: "Apr 10, 2026", event: "Sens. Schiff and Gallego withdraw endorsements" },
        { year: "Apr 12, 2026", event: "Suspends campaign on X: 'this is my fight, not a campaign's'" },
      ],
      endorsements: [{ category: "Elected Officials", name: "[All major endorsements withdrawn]" }],
      voteForIf: [
        "[Campaign suspended; voters who already mailed ballots before April 12 may have voted for him]",
      ],
      bottomLine:
        "Suspended campaign. <mark>Name remains on printed ballots</mark>. Per state law, votes cast for a suspended candidate are still counted but do not result in a viable runoff position.",
      news: [
        {
          id: "swalwell-n1",
          type: "news",
          source: "NPR",
          title: "Fighting assault allegations, Swalwell suspends his bid for California governor",
          excerpt:
            "The Bay Area congressman ended his campaign three days after CNN and the SF Chronicle published allegations from four women.",
          url: "https://www.npr.org/2026/04/12/nx-s1-5782055/swalwell-suspends-campaign-assault-allegations-governor-california",
          date: "2026-04-12T18:00:00Z",
        },
        {
          id: "swalwell-n2",
          type: "news",
          source: "CNN Politics",
          title: "Inside the sudden downfall of Eric Swalwell",
          excerpt:
            "How a campaign that led the Democratic field collapsed in 72 hours, with staff resignations and endorsement withdrawals from Schiff and Gallego.",
          url: "https://www.cnn.com/2026/04/15/politics/eric-swalwell-allegations-congress-downfall",
          date: "2026-04-15T20:00:00Z",
        },
        {
          id: "swalwell-n3",
          type: "news",
          source: "Washington Post",
          title: "Eric Swalwell, California governor candidate, accused of sexual assault by ex-staffer",
          excerpt:
            "Four women told CNN and the SF Chronicle they experienced misconduct by Swalwell, including allegations of unwanted contact and rape.",
          url: "https://www.washingtonpost.com/politics/2026/04/10/eric-swalwell-sexual-assault-allegations/",
          date: "2026-04-10T13:00:00Z",
        },
      ],
      issues: {
        affordability: { stance: "[Campaign suspended]" },
        housing: { stance: "[Campaign suspended]" },
        economy: { stance: "[Campaign suspended]" },
        climate: { stance: "[Campaign suspended]" },
        homelessness: { stance: "[Campaign suspended]" },
        immigration: { stance: "[Campaign suspended]" },
        healthcare: { stance: "[Campaign suspended]" },
        education: { stance: "[Campaign suspended]" },
        ai: { stance: "[Campaign suspended]" },
        abortion: { stance: "[Campaign suspended]" },
        trump: { stance: "[Campaign suspended]" },
        crime: { stance: "[Campaign suspended]" },
      },
    },

    // ===========================================================
    // BETTY YEE (D) — SUSPENDED
    // ===========================================================
    {
      id: "yee",
      name: "Betty Yee",
      party: "Democratic",
      major: false,
      pollingStatus: "Suspended",
      campaignSuspended: {
        date: "Early 2026",
        note: "Suspended her gubernatorial campaign earlier in the cycle citing fundraising headwinds. Name remains on the printed ballot.",
      },
      currentRole: "Former California State Controller",
      pastRoles: [
        "California State Controller (2015–2023)",
        "Member, California State Board of Equalization, District 1 (2004–2015)",
        "Chief Deputy Director, California Department of Finance",
      ],
      background:
        "Yee is the former two-term California State Controller and a longtime fiscal-policy specialist. She entered the governor's race in 2024 with a fiscal-stewardship message but suspended her campaign earlier in 2026 after struggling to break out of the bottom of the field.",
      priorities: ["[Campaign suspended]"],
      stances: ["[Campaign suspended]"],
      strengths: ["Two-term statewide elected officer", "Deepest fiscal expertise in the field"],
      criticisms: ["Could not raise competitive funds", "Limited brand outside Sacramento finance circles"],
      history: [
        { year: "2004", event: "Elected to California State Board of Equalization, District 1" },
        { year: "2014", event: "Elected California State Controller" },
        { year: "2018", event: "Re-elected State Controller" },
        { year: "2024", event: "Declares candidacy for governor" },
        { year: "2026", event: "Suspends gubernatorial campaign" },
      ],
      endorsements: [{ category: "Elected Officials", name: "[Endorsements released]" }],
      voteForIf: ["[Campaign suspended]"],
      bottomLine: "Suspended campaign. <mark>Name remains on printed ballots</mark>.",
      issues: {
        affordability: { stance: "[Campaign suspended]" },
        housing: { stance: "[Campaign suspended]" },
        economy: { stance: "[Campaign suspended]" },
        climate: { stance: "[Campaign suspended]" },
        homelessness: { stance: "[Campaign suspended]" },
        immigration: { stance: "[Campaign suspended]" },
        healthcare: { stance: "[Campaign suspended]" },
        education: { stance: "[Campaign suspended]" },
        ai: { stance: "[Campaign suspended]" },
        abortion: { stance: "[Campaign suspended]" },
        trump: { stance: "[Campaign suspended]" },
        crime: { stance: "[Campaign suspended]" },
      },
    },
  ],
};
