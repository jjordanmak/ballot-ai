import { PARTY_TO_KEY, type Party } from "@/data/types";

/** Full party name as displayed in pills. "Democratic" → "Democrat" reads more
 * naturally as a label, while we keep the formal type values as-is. */
const PARTY_LABEL: Record<Party, string> = {
  Democratic: "Democrat",
  Republican: "Republican",
  Green: "Green",
  Libertarian: "Libertarian",
  "Peace and Freedom": "Peace & Freedom",
  "American Independent": "American Indep.",
  "No Party Preference": "No Party Pref.",
  Independent: "Independent",
};

export function partyLabel(p: Party) {
  return PARTY_LABEL[p];
}

/**
 * STATIC class maps — Tailwind's scanner can only see literal strings, not
 * template-built ones. This is why the polling bars/dots looked grey before:
 * `bg-[var(--color-${key})]` was never compiled into the CSS bundle.
 */

const PARTY_BG_PILL: Record<string, string> = {
  dem: "bg-[var(--color-dem-soft)] text-[var(--color-dem)]",
  rep: "bg-[var(--color-rep-soft)] text-[var(--color-rep)]",
  grn: "bg-[var(--color-grn-soft)] text-[var(--color-grn)]",
  lib: "bg-[var(--color-lib-soft)] text-[var(--color-lib)]",
  pf: "bg-[var(--color-pf-soft)] text-[var(--color-pf)]",
  aip: "bg-[var(--color-aip-soft)] text-[var(--color-aip)]",
  np: "bg-[var(--color-np-soft)] text-[var(--color-np)]",
};

const PARTY_BG_SOLID: Record<string, string> = {
  dem: "bg-[var(--color-dem)]",
  rep: "bg-[var(--color-rep)]",
  grn: "bg-[var(--color-grn)]",
  lib: "bg-[var(--color-lib)]",
  pf: "bg-[var(--color-pf)]",
  aip: "bg-[var(--color-aip)]",
  np: "bg-[var(--color-np)]",
};

const PARTY_BORDER: Record<string, string> = {
  dem: "border-[var(--color-dem)]",
  rep: "border-[var(--color-rep)]",
  grn: "border-[var(--color-grn)]",
  lib: "border-[var(--color-lib)]",
  pf: "border-[var(--color-pf)]",
  aip: "border-[var(--color-aip)]",
  np: "border-[var(--color-np)]",
};

export function partyClass(party: Party) {
  return PARTY_BG_PILL[PARTY_TO_KEY[party]];
}

export function partyDot(party: Party) {
  return PARTY_BG_SOLID[PARTY_TO_KEY[party]];
}

export function partyBorder(party: Party) {
  return PARTY_BORDER[PARTY_TO_KEY[party]];
}

export function PartyTag({ party, size = "sm" }: { party: Party; size?: "xs" | "sm" | "md" }) {
  const sizeCls =
    size === "xs"
      ? "text-[10px] px-2 py-0.5"
      : size === "md"
      ? "text-[12px] px-3 py-1"
      : "text-[11px] px-2.5 py-0.5";
  return (
    <span
      className={`font-mono-cap inline-flex items-center gap-1.5 rounded-full ${partyClass(party)} ${sizeCls} font-medium`}
      title={party}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${partyDot(party)}`} />
      {partyLabel(party)}
    </span>
  );
}

/**
 * Generic status pill — used for polling status next to candidate name.
 * Tone is mapped from the polling status string at the call site.
 */
export type PillTone =
  | "default"
  | "warn"
  | "info"
  | "green"
  | "teal"
  | "orange"
  | "purple"
  | "pink"
  | "red";

const PILL_TONE: Record<PillTone, string> = {
  default: "bg-[var(--color-ink-2)] text-[var(--color-paper-2)] border border-[var(--color-ink-3)]",
  warn: "bg-[var(--color-accent-mute)] text-[var(--color-accent)] border border-[var(--color-accent-soft)]",
  info: "bg-[var(--color-ink-2)] text-[var(--color-paper)] border border-[var(--color-ink-3)]",
  green: "bg-[var(--color-tint-green-soft)] text-[var(--color-tint-green)] border border-[var(--color-tint-green-soft)]",
  teal: "bg-[var(--color-tint-teal-soft)] text-[var(--color-tint-teal)] border border-[var(--color-tint-teal-soft)]",
  orange: "bg-[var(--color-tint-orange-soft)] text-[var(--color-tint-orange)] border border-[var(--color-tint-orange-soft)]",
  purple: "bg-[var(--color-tint-purple-soft)] text-[var(--color-tint-purple)] border border-[var(--color-tint-purple-soft)]",
  pink: "bg-[var(--color-tint-pink-soft)] text-[var(--color-tint-pink)] border border-[var(--color-tint-pink-soft)]",
  red: "bg-[oklch(70%_0.14_25_/_0.18)] text-[var(--color-trend-down)] border border-[oklch(70%_0.14_25_/_0.30)]",
};

export function StatusPill({
  children,
  tone = "default",
  size = "sm",
}: {
  children: React.ReactNode;
  tone?: PillTone;
  size?: "xs" | "sm";
}) {
  const sizeCls = size === "xs" ? "text-[9px] px-2 py-0.5" : "text-[10px] px-2.5 py-0.5";
  return (
    <span
      className={`font-mono-cap inline-flex items-center gap-1 rounded-full whitespace-nowrap ${sizeCls} ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Map a polling-status string to a pill tone for color-coded display. */
export function pollingTone(status: string): PillTone {
  const s = status.toLowerCase();
  if (s.includes("suspend") || s.includes("withdraw")) return "pink";
  if (s.includes("unopposed")) return "green";
  if (s.includes("first") || s.includes("frontrunner")) return "green";
  if (s.includes("top tier")) return "teal";
  if (s.includes("competitive")) return "teal";
  if (s.includes("trailing")) return "orange";
  if (s.includes("long shot")) return "purple";
  return "default";
}
