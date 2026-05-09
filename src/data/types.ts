export type Party =
  | "Democratic"
  | "Republican"
  | "Green"
  | "Libertarian"
  | "Peace and Freedom"
  | "American Independent"
  | "No Party Preference"
  | "Independent";

export type PartyKey = "dem" | "rep" | "grn" | "lib" | "pf" | "aip" | "np";

export type PollingStatus =
  | "Frontrunner"
  | "Top tier"
  | "Competitive"
  | "Trailing"
  | "Long shot"
  | "Suspended"
  | "Unopposed"
  | "Withdrawn";

export interface IssuePosition {
  /** Concise stance — 1–3 short sentences. May contain <mark> tags for emphasis. */
  stance: string;
  /** One-word evidence label, e.g. "On record", "Campaign site", "Debate", "Voting record" */
  source?: string;
}

/**
 * Voter-friendly categorization replaces the old Major/Notable/Local tiers,
 * which obscured WHO an endorsement was from.
 */
export type EndorsementCategory =
  | "Elected Officials"
  | "Unions"
  | "Advocacy & Industry"
  | "Local Leaders"
  | "Newspapers & Media";

export interface Endorsement {
  category: EndorsementCategory;
  name: string;
}

export interface Candidate {
  id: string;
  name: string;
  party: Party;
  /** Optional headshot URL (e.g. Wikimedia portrait). Falls back to initials. */
  headshot?: string;
  /** Whether the candidate appears in the comparison table by default. */
  major: boolean;
  /** Pre-formatted % string, or descriptor like "Suspended" / "Unopposed". */
  pollingStatus: string;
  /** Optional polling number (0–100) for visual bar. */
  pollingPct?: number;
  /** Trend signal for the polling card. */
  trend?: "up" | "down" | "flat";
  campaignSuspended?: { date: string; note: string };
  withdrawn?: boolean;
  currentRole: string;
  pastRoles: string[];
  background: string; // 2–4 sentences, may contain <mark>
  priorities: string[];
  stances: string[];
  strengths: string[];
  criticisms: string[];
  history: { year: string; event: string }[];
  endorsements: Endorsement[];
  voteForIf: string[];
  bottomLine: string;
  /** Issue id → position. */
  issues: Record<string, IssuePosition>;
  /** Optional news feed for this candidate (will be live in v2). */
  news?: NewsItem[];
}

export const ENDORSEMENT_ORDER: EndorsementCategory[] = [
  "Elected Officials",
  "Unions",
  "Advocacy & Industry",
  "Local Leaders",
  "Newspapers & Media",
];

/** News feed item — placeholder for the eventual real-time feed.
 * Type drives both the icon and the color in the feed UI. */
export type NewsItemType = "news" | "social" | "poll" | "endorsement";

export type SocialPlatform =
  | "X"
  | "Truth Social"
  | "Threads"
  | "Bluesky"
  | "Instagram"
  | "Facebook";

export interface NewsItem {
  id: string;
  type: NewsItemType;
  /** Display name of the source (e.g. "CalMatters" or, for social, the
   * candidate's display name). Set this for non-social items. */
  source: string;
  title: string;
  /** 2-line description / SEO snippet shown under the title. */
  excerpt?: string;
  url?: string;
  /** ISO timestamp preferred for live feeds (sortable, formatable).
   * For scaffolded data, a human string like "May 5, 2026" is also OK. */
  date: string;
  /** Required for type === "social" — drives the embed-style card. */
  social?: {
    platform: SocialPlatform;
    handle: string; // without leading @
    avatar?: string; // URL — will fall back to candidate headshot when omitted
    /** Attached photo or video. Up to 4 photos or 1 video, mirroring most
     * platforms' upload limits. */
    media?: SocialMedia[];
    /** Inline poll embedded in the post. Mirrors X/Threads polls. */
    poll?: {
      options: { label: string; pct: number }[];
      totalVotes?: number;
      closed?: boolean;
    };
    /** Mark for short-form video (Reels, TikTok-style) so the embed renders
     * a vertical aspect ratio instead of widescreen. */
    isReel?: boolean;
    /** Optional engagement counts shown at the bottom of the embed. */
    likes?: number;
    reposts?: number;
    replies?: number;
  };
}

export type SocialMedia =
  | { type: "image"; url: string; alt?: string }
  | { type: "video"; thumbnail: string; durationSec?: number };

export interface Issue {
  id: string;
  label: string;
  /** A one-line context for the row when no position is available. */
  fallback?: string;
}

export interface Race {
  id: string;
  /** Display office name */
  office: string;
  /** Subtitle, e.g. "California Statewide" */
  jurisdiction: string;
  /** Race format, e.g. "Top-Two Open Primary" */
  format: string;
  /** Brief format explainer */
  formatExplainer: string;
  /** Term length, salary, etc. shown in the header strip */
  meta: { label: string; value: string }[];
  unopposed: boolean;
  /** Race-level intro sections */
  intro: {
    context: string;
    whyItMatters: string;
    bigPicture: string;
    whatsAtStake: string;
    polling: string;
    /** Optional source URL for the polling card — when present, the
     * source label below the bar chart becomes a hyperlink. */
    pollingSourceUrl?: string;
    /** Display label for the polling source (e.g. "Emerson · Inside CA Politics · Apr 14–15") */
    pollingSourceLabel?: string;
    suspendedNote?: string;
  };
  issues: Issue[];
  candidates: Candidate[];
  /** Optional race-wide news feed (will be live in v2). */
  news?: NewsItem[];
}

export const PARTY_TO_KEY: Record<Party, PartyKey> = {
  Democratic: "dem",
  Republican: "rep",
  Green: "grn",
  Libertarian: "lib",
  "Peace and Freedom": "pf",
  "American Independent": "aip",
  "No Party Preference": "np",
  Independent: "np",
};
