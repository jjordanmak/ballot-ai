"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  AlertOctagon,
  Award,
  ListChecks,
  Compass,
  Sparkles,
  AlertTriangle,
  Flag,
  Info,
  ChevronLeft,
  ChevronRight,
  History as HistoryIcon,
  TrendingUp,
  TrendingDown,
  Minus,
  Briefcase,
  BadgeCheck,
  UserCheck,
} from "lucide-react";
import { NewsFeed } from "./NewsFeed";
import type { Candidate, EndorsementCategory } from "@/data/types";
import { ENDORSEMENT_ORDER } from "@/data/types";
import { partyClass, partyDot, partyLabel, StatusPill } from "./PartyTag";
import { RichText, RichBlock } from "./Highlight";

/**
 * SUPPLEMENTARY TINTS for variety / reducing yellow fatigue.
 * Each Key pillar uses its own tint AND scopes its highlight color via
 * an `hl-section-*` wrapper class — so any <mark> inside a Strengths
 * pillar reads as green, inside Criticisms as pink, etc.
 */
const TINT = {
  priorities: {
    fg: "text-[var(--color-tint-orange)]",
    bg: "bg-[var(--color-tint-orange)]",
    hl: "hl-section-warn",
  },
  stances: {
    fg: "text-[var(--color-tint-teal)]",
    bg: "bg-[var(--color-tint-teal)]",
    hl: "hl-section-info",
  },
  strengths: {
    fg: "text-[var(--color-tint-green)]",
    bg: "bg-[var(--color-tint-green)]",
    hl: "hl-section-good",
  },
  criticisms: {
    fg: "text-[var(--color-tint-pink)]",
    bg: "bg-[var(--color-tint-pink)]",
    hl: "hl-section-danger",
  },
} as const;

interface Props {
  candidate: Candidate;
  raceId: string;
  unopposed?: boolean;
  /** When set by the page-level expand/collapse all controls, the profile
   * follows this state regardless of its own initial value. */
  forceOpen?: boolean;
}

export function CandidateProfile({ candidate, raceId, unopposed, forceOpen }: Props) {
  const suspended = !!candidate.campaignSuspended;
  // Suspended candidates start COLLAPSED (their content is reduced anyway).
  // Active candidates start expanded. `forceOpen` is set by the page-level
  // expand-all/collapse-all controls and overrides the default.
  const [open, setOpen] = useState(!suspended);
  // React to expand-all / collapse-all toggles
  useEffect(() => {
    if (forceOpen !== undefined) setOpen(forceOpen);
  }, [forceOpen]);

  return (
    <article
      id={`candidate-${raceId}-${candidate.id}`}
      className={`scroll-mt-32 rounded-xl border ${
        suspended
          ? "border-[var(--color-ink-3)] bg-[var(--color-ink-1)]/40 opacity-90"
          : "border-[var(--color-ink-3)] bg-[var(--color-ink-1)]"
      }`}
    >
      {/* HEADER — non-sticky, scrolls with its article.
          Layout: [Headshot] [Name + pills + role] [Chevron] */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-5 py-5 sm:px-8 sm:py-8 flex items-center gap-5 sm:gap-6 group bg-[var(--color-ink-1)] rounded-t-xl"
      >
        {/* Headshot, left of identity */}
        <Headshot
          candidate={candidate}
          className="shrink-0 w-[72px] h-[72px] sm:w-[112px] sm:h-[112px] rounded-xl"
        />

        {/* Identity — vertically centered next to the photo */}
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[20px] leading-[1.1] tracking-[-0.02em] text-balance">
            {candidate.name}
          </h3>

          <div className="mt-2 flex items-center gap-2 flex-nowrap overflow-hidden">
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full font-mono-cap text-[10px] px-2.5 py-0.5 ${partyClass(candidate.party)}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${partyDot(candidate.party)}`} />
              {partyLabel(candidate.party)}
            </span>

            {suspended ? (
              <StatusPill tone="red" size="sm">
                <AlertOctagon size={10} /> Campaign suspended
              </StatusPill>
            ) : unopposed ? (
              <StatusPill tone="default" size="sm">
                Running unopposed
              </StatusPill>
            ) : (
              <StatusPill tone="default" size="sm">
                <span>
                  {candidate.pollingStatus}
                  {candidate.pollingPct != null && ` · ${candidate.pollingPct}%`}
                </span>
                {candidate.trend && (
                  <TrendArrow trend={candidate.trend} />
                )}
              </StatusPill>
            )}
          </div>

          {/* Tighter gap between pills and current role */}
          <div className="mt-2 text-[14px] text-[var(--color-paper-2)]">
            {candidate.currentRole}
          </div>
        </div>

        <ChevronDown
          size={20}
          className={`shrink-0 mt-2 text-[var(--color-paper-3)] transition-transform duration-300 ${
            open ? "rotate-180 text-[var(--color-accent)]" : ""
          }`}
        />
      </button>

      {/* COLLAPSIBLE BODY */}
      <div
        className="grid transition-[grid-template-rows] duration-400 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 sm:px-8 sm:pb-8 border-t border-[var(--color-ink-3)]">
            {suspended ? (
              <SuspendedBlock candidate={candidate} raceId={raceId} />
            ) : (
              <FullBody candidate={candidate} raceId={raceId} />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function SuspendedBlock({ candidate, raceId }: { candidate: Candidate; raceId: string }) {
  return (
    <div className="pt-6 space-y-10">
      <div className="rounded-lg bg-[oklch(70%_0.14_25_/_0.10)] p-5 border border-[oklch(70%_0.14_25_/_0.30)]">
        <div className="font-mono-cap text-[10px] text-[var(--color-trend-down)] mb-2 flex items-center gap-2">
          <AlertOctagon size={12} /> Suspended {candidate.campaignSuspended?.date}
        </div>
        <RichBlock
          text={candidate.campaignSuspended?.note ?? ""}
          className="text-[14px] text-[var(--color-paper)] leading-relaxed"
        />
      </div>
      <Section title="Background" icon={<Compass size={13} />}>
        <RichBlock
          text={candidate.background}
          className="text-[14px] leading-relaxed text-[var(--color-paper-2)] max-w-3xl"
        />
      </Section>
      {candidate.history.length > 0 && <TimelineSection items={candidate.history} />}
      {candidate.news && candidate.news.length > 0 && (
        <NewsFeed
          items={candidate.news}
          fallbackAvatar={candidate.headshot}
          candidateDbId={`${raceId}__${candidate.id}`}
        />
      )}
    </div>
  );
}

const PILLAR_TOOLTIPS: Record<string, string> = {
  "Key Priorities":
    "What this candidate has named as their top campaign priorities — the issues they say they will focus on first if elected.",
  "Key Stances":
    "The candidate's stated positions on specific policy questions, drawn from campaign materials, debates, and public statements.",
  "Key Strengths":
    "Reasons this candidate may be well-qualified or well-positioned for this office — record, experience, coalition, or message.",
  "Key Criticisms":
    "Substantive concerns or attack lines raised about this candidate by opponents, journalists, or the public record.",
};

function FullBody({ candidate, raceId }: { candidate: Candidate; raceId: string }) {
  return (
    // Vertical rhythm: 48px (space-y-12) between major sections in the
    // expanded profile body. Matches mt-12 used for the body's outer wrapper.
    <div className="pt-8 space-y-12">
      {/* Row 1: 2x2 — Background + Past Positions callout get equal weight. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <SectionHeading title="Background" icon={<Compass size={13} />} />
          <RichBlock
            text={candidate.background}
            className="text-[15px] leading-[1.7] text-[var(--color-paper-2)] text-pretty"
          />
        </div>
        {/* Past Positions: lighter gray callout with a faded list — it's
            reference, not lead context. */}
        <div className="rounded-xl bg-[var(--color-ink-2)]/60 border border-[var(--color-ink-3)] p-5">
          <SectionHeading title="Past Positions" icon={<Briefcase size={13} />} />
          {candidate.pastRoles.length > 0 ? (
            <ul className="space-y-2.5 opacity-70">
              {candidate.pastRoles.map((role, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-[13px] leading-[1.5] text-[var(--color-paper-2)]"
                >
                  <span className="mt-1.5 w-1 h-1 shrink-0 rounded-full bg-[var(--color-paper-3)]" />
                  <span>{role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] italic text-[var(--color-paper-4)]">
              No prior elected or appointed positions on record.
            </p>
          )}
        </div>
      </div>

      {/* Row 2: 4-up pillars. Strengths uses BadgeCheck (Sparkles is reserved
          for Bottom Line). */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Pillar title="Key Priorities" icon={<Flag size={12} />} items={candidate.priorities} tint={TINT.priorities} />
        <Pillar title="Key Stances" icon={<ListChecks size={12} />} items={candidate.stances} tint={TINT.stances} />
        <Pillar title="Key Strengths" icon={<BadgeCheck size={12} />} items={candidate.strengths} tint={TINT.strengths} />
        <Pillar title="Key Criticisms" icon={<AlertTriangle size={12} />} items={candidate.criticisms} tint={TINT.criticisms} />
      </div>

      {/* History — full-width timeline below the 4-up.
          The Section eyebrow row hosts the timeline's left/right scroll arrows. */}
      <TimelineSection items={candidate.history} />


      {/* Endorsements — split into columns by category. */}
      <Section title="Endorsements" icon={<Award size={13} />}>
        <EndorsementColumns endorsements={candidate.endorsements} />
      </Section>

      {/* In the news — candidate-level feed (carousel) */}
      <NewsFeed
        items={candidate.news}
        fallbackAvatar={candidate.headshot}
        candidateDbId={`${raceId}__${candidate.id}`}
      />

      {/* You should vote for X if — sits between News and Bottom Line as a
          natural decision-moment after the user has read the context. Numbers
          use IBM Plex Serif's old-style figures for a more editorial feel. */}
      <Section
        title={`You should vote for ${candidate.name.split(" ").slice(-1)[0]} if…`}
        icon={<UserCheck size={13} />}
      >
        <ul className="no-highlights grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {candidate.voteForIf.map((line, i) => (
            <li
              key={i}
              className="flex items-center gap-4 sm:flex-col sm:items-center sm:text-center rounded-xl bg-[var(--color-ink-1)] border border-[var(--color-ink-3)] px-5 py-4 sm:px-6 sm:pt-7 sm:pb-4 sm:min-h-[200px]"
            >
              <span
                className="shrink-0 font-display italic text-[48px] sm:text-[60px] leading-none text-[var(--color-accent)]"
                style={{ fontVariantNumeric: "oldstyle-nums proportional-nums" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 flex items-center">
                <RichText
                  text={line}
                  className="text-[15px] leading-[1.6] text-[var(--color-paper)] text-pretty"
                />
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Bottom line — Section eyebrow inside the rounded callout. */}
      <section>
        <div className="rounded-xl bg-[var(--color-ink-0)] border border-[var(--color-ink-3)] p-8 sm:p-10">
          <SectionHeading title="The bottom line" icon={<Sparkles size={13} />} />
          <RichBlock
            text={candidate.bottomLine}
            className="font-display text-[18px] sm:text-[19px] leading-[1.55] text-[var(--color-paper)] text-pretty max-w-[72ch]"
          />
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="font-mono-cap text-[11px] text-[var(--color-paper)] mb-4 flex items-center gap-2 tracking-[0.16em]">
      {icon && <span className="text-[var(--color-accent)]">{icon}</span>}
      {title}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <SectionHeading title={title} icon={icon} />
      {children}
    </section>
  );
}

function Pillar({
  title,
  icon,
  items,
  tint,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  tint: { fg: string; bg: string; hl: string };
}) {
  const tooltip = PILLAR_TOOLTIPS[title];
  return (
    <div className={tint.hl}>
      <div className="font-mono-cap text-[10px] text-[var(--color-paper-2)] mb-3 flex items-center gap-2 group">
        <span className={tint.fg}>{icon}</span>
        <span>{title}</span>
        {tooltip && (
          <span
            tabIndex={0}
            className="relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[var(--color-paper-3)] hover:text-[var(--color-paper)] focus:text-[var(--color-paper)] cursor-help group/tip"
            aria-label={tooltip}
          >
            <Info size={11} />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[260px] z-30 opacity-0 group-hover/tip:opacity-100 group-focus/tip:opacity-100 transition-opacity duration-150 rounded-lg bg-[var(--color-ink-0)] border border-[var(--color-ink-3)] shadow-xl p-3 text-left"
            >
              <span className={`block font-mono-cap text-[9px] mb-1 ${tint.fg}`}>{title}</span>
              <span className="block text-[11px] text-[var(--color-paper-2)] leading-snug normal-case tracking-normal">
                {tooltip}
              </span>
            </span>
          </span>
        )}
      </div>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className={`mt-1.5 w-1 h-1 shrink-0 rounded-full ${tint.bg}`} />
            <RichText
              text={item}
              className="text-[13px] leading-[1.55] text-[var(--color-paper)] text-pretty"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * History timeline with its own section heading + arrow navigation aligned
 * vertically with the heading. Hides the scrollbar; scrolls imperatively
 * via the arrows or by drag/swipe gesture.
 */
/** Extract a 4-digit year from a year-or-date string. Returns NaN when
 *  the value isn't parseable (e.g. "TBD", "Apr 2026"). */
function parseYear(s: string): number {
  const m = s.match(/(19|20)\d{2}/);
  return m ? parseInt(m[0], 10) : NaN;
}

function TimelineSection({ items }: { items: { year: string; event: string }[] }) {
  // Reverse order so the most recent event renders on the LEFT. Anything
  // older than the last 2 years (relative to the newest event) is faded
  // since it predates the current election cycle.
  const ordered = useMemo(() => {
    const withYear = items.map((it) => ({ ...it, _y: parseYear(it.year) }));
    const newest = Math.max(
      ...withYear.map((it) => (Number.isFinite(it._y) ? it._y : 0)),
      new Date().getFullYear()
    );
    const cycleStart = newest - 1; // current cycle = newest year + previous year
    // Sort descending so most recent is first (= leftmost in the row layout)
    return withYear
      .slice()
      .sort((a, b) => (Number.isFinite(b._y) ? b._y : 0) - (Number.isFinite(a._y) ? a._y : 0))
      .map((it) => ({
        year: it.year,
        event: it.event,
        inCycle: !Number.isFinite(it._y) || it._y >= cycleStart,
      }));
  }, [items]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const updateAffordance = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateAffordance();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateAffordance, { passive: true });
    window.addEventListener("resize", updateAffordance);
    return () => {
      el.removeEventListener("scroll", updateAffordance);
      window.removeEventListener("resize", updateAffordance);
    };
  }, []);

  const scrollBy = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = direction === "right" ? el.clientWidth * 0.7 : -el.clientWidth * 0.7;
    el.scrollBy({ left: delta, behavior: "smooth" });
    window.setTimeout(updateAffordance, 350);
  };

  return (
    <section>
      {/* Heading row — arrows disable at either end of the horizontal rail. */}
      <div className="mb-5 flex items-center gap-3">
        <div className="font-mono-cap text-[11px] text-[var(--color-paper)] flex items-center gap-2 flex-1 tracking-[0.16em]">
          <HistoryIcon size={12} className="text-[var(--color-accent)]" />
          Timeline
          <span
            tabIndex={0}
            className="relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[var(--color-paper-3)] hover:text-[var(--color-paper)] focus:text-[var(--color-paper)] cursor-help group/tip ml-0.5"
            aria-label="About the timeline"
          >
            <Info size={11} />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full mt-2 w-[260px] z-50 opacity-0 group-hover/tip:opacity-100 group-focus/tip:opacity-100 transition-opacity duration-150 rounded-lg bg-[var(--color-ink-0)] border border-[var(--color-ink-3)] shadow-xl p-3 text-left"
            >
              <span className="block text-[11px] text-[var(--color-paper-2)] leading-snug normal-case tracking-normal">
                Faded events predate the current election cycle.
              </span>
            </span>
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => scrollBy("left")}
            disabled={!canLeft}
            className={`w-8 h-8 rounded-full border border-[var(--color-ink-3)] flex items-center justify-center transition-colors ${
              canLeft
                ? "hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-[var(--color-paper-3)]"
                : "text-[var(--color-paper-4)] opacity-45 cursor-default"
            }`}
            aria-label="Scroll timeline left"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => scrollBy("right")}
            disabled={!canRight}
            className={`w-8 h-8 rounded-full border border-[var(--color-ink-3)] flex items-center justify-center transition-colors ${
              canRight
                ? "hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-[var(--color-paper-3)]"
                : "text-[var(--color-paper-4)] opacity-45 cursor-default"
            }`}
            aria-label="Scroll timeline right"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Timeline scroll container with bilateral edge fades.
          Ordering: most-recent event is leftmost. Events that fall outside
          the current election cycle (older than the newest event year - 1)
          render at reduced opacity so the cycle-relevant context is visually
          dominant. */}
      <div className="relative">
        <div ref={scrollRef} className="overflow-x-auto scrollbar-hide">
          <div className="relative flex items-stretch min-w-min pt-2 pb-1">
            <div
              aria-hidden
              className="absolute left-0 right-0 top-[18px] h-px bg-[var(--color-ink-3)]"
            />
            {ordered.map((item, i) => (
              <div
                key={i}
                className={`relative flex flex-col items-start min-w-[220px] max-w-[260px] pr-6 transition-opacity ${
                  item.inCycle ? "" : "opacity-40"
                }`}
              >
                <div className="relative z-10 w-[14px] h-[14px] rounded-full bg-[var(--color-ink-1)] border-2 border-[var(--color-accent)] flex items-center justify-center">
                  <span className="w-1 h-1 rounded-full bg-[var(--color-accent)]" />
                </div>
                <div className="mt-3 font-mono race-number text-[11px] text-[var(--color-accent-deep)] tabular-nums tracking-wide">
                  {item.year}
                </div>
                <RichText
                  text={item.event}
                  className="mt-1.5 text-[12px] leading-[1.5] text-[var(--color-paper-2)]"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Left-edge fade — visible only when there's content scrolled past */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-0 top-0 bottom-1 w-16 transition-opacity duration-300 ${
            canLeft ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              "linear-gradient(to right, var(--color-ink-1) 0%, transparent 100%)",
          }}
        />

        {/* Right-edge fade */}
        <div
          aria-hidden
          className={`pointer-events-none absolute right-0 top-0 bottom-1 w-16 transition-opacity duration-300 ${
            canRight ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              "linear-gradient(to left, var(--color-ink-1) 0%, transparent 100%)",
          }}
        />
      </div>

      {/* "See more" hint — bottom right. Bounces to draw the eye, fades
          out once the user has reached the end of the timeline. (The
          out-of-cycle legend lives in the Info tooltip on the eyebrow.) */}
      <div
        aria-hidden
        className={`mt-2 flex justify-end transition-opacity duration-300 ${
          canRight ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <span className="font-mono-cap text-[10px] text-[var(--color-paper-3)] flex items-center gap-1.5 tracking-[0.18em] animate-nudge-x">
          See more
          <ChevronRight size={12} />
        </span>
      </div>
    </section>
  );
}

/**
 * Editorial headshot — fills its container, sized via parent grid cell.
 * Uses Wikimedia portrait when available; falls back to a stylized
 * initials badge tinted by party color (and gracefully swaps to initials
 * if the image URL fails at runtime).
 */
function Headshot({ candidate, className = "" }: { candidate: Candidate; className?: string }) {
  const [errored, setErrored] = useState(false);
  const initials = candidate.name
    .split(" ")
    .map((part) => part[0])
    .filter((c) => /[A-Za-z]/.test(c))
    .slice(0, 2)
    .join("");

  // Map party → soft tint for fallback bg / text. Static so Tailwind sees them.
  const fallbackTone: Record<string, { bg: string; fg: string }> = {
    Democratic: { bg: "bg-[var(--color-dem-soft)]", fg: "text-[var(--color-dem)]" },
    Republican: { bg: "bg-[var(--color-rep-soft)]", fg: "text-[var(--color-rep)]" },
    Green: { bg: "bg-[var(--color-grn-soft)]", fg: "text-[var(--color-grn)]" },
    Libertarian: { bg: "bg-[var(--color-lib-soft)]", fg: "text-[var(--color-lib)]" },
    "Peace and Freedom": { bg: "bg-[var(--color-pf-soft)]", fg: "text-[var(--color-pf)]" },
    "American Independent": { bg: "bg-[var(--color-aip-soft)]", fg: "text-[var(--color-aip)]" },
    "No Party Preference": { bg: "bg-[var(--color-np-soft)]", fg: "text-[var(--color-np)]" },
    Independent: { bg: "bg-[var(--color-np-soft)]", fg: "text-[var(--color-np)]" },
  };
  const tone = fallbackTone[candidate.party] ?? fallbackTone["No Party Preference"];

  const showImage = candidate.headshot && !errored;

  // Two layout modes:
  //   1. Caller provides explicit fixed dimensions (rounded-xl w-[N] h-[N]) →
  //      we use them as-is. Used in the candidate profile header.
  //   2. Caller passes no sizing — we self-stretch into the parent grid cell
  //      (used by the bottom-line section). Falls back to a min-height for
  //      mobile where the cell collapses.
  const explicitlySized = /\b(?:w-\[|h-\[|w-\d|h-\d)/.test(className);

  return (
    <div
      className={`${className} relative bg-[var(--color-ink-1)] overflow-hidden ${
        explicitlySized
          ? "border border-[var(--color-ink-3)]"
          : "min-h-[240px] md:min-h-0 self-stretch border-t md:border-t-0 md:border-l border-[var(--color-ink-3)]"
      }`}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidate.headshot}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className={`absolute inset-0 flex items-center justify-center ${tone.bg}`}>
          <span className={`font-display ${explicitlySized ? "text-[40px]" : "text-[72px]"} leading-none ${tone.fg}`}>
            {initials}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Trend arrow rendered inline inside the polling status pill.
 * Lucide icons size to 1em so they match the pill's font height exactly.
 */
export function TrendArrow({ trend }: { trend: "up" | "down" | "flat" }) {
  const cls = "ml-0.5 inline-flex items-center align-middle";
  if (trend === "flat") {
    return (
      <span className={`${cls} text-[var(--color-paper-3)]`} aria-label="flat">
        <Minus size="1em" strokeWidth={2.5} />
      </span>
    );
  }
  if (trend === "up") {
    return (
      <span className={`${cls} text-[var(--color-trend-up)]`} aria-label="trending up">
        <TrendingUp size="1em" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className={`${cls} text-[var(--color-trend-down)]`} aria-label="trending down">
      <TrendingDown size="1em" strokeWidth={2.5} />
    </span>
  );
}

/**
 * Endorsements split into columns by voter-friendly category.
 * Categories with no entries are omitted.
 */
function EndorsementColumns({
  endorsements,
}: {
  endorsements: Candidate["endorsements"];
}) {
  const grouped = ENDORSEMENT_ORDER.reduce<Record<EndorsementCategory, Candidate["endorsements"]>>(
    (acc, cat) => {
      acc[cat] = endorsements.filter((e) => e.category === cat);
      return acc;
    },
    {} as Record<EndorsementCategory, Candidate["endorsements"]>
  );

  const categoryTone: Record<EndorsementCategory, { fg: string; bg: string }> = {
    "Elected Officials": {
      fg: "text-[var(--color-tint-teal)]",
      bg: "bg-[var(--color-tint-teal)]",
    },
    Unions: {
      fg: "text-[var(--color-tint-orange)]",
      bg: "bg-[var(--color-tint-orange)]",
    },
    "Advocacy & Industry": {
      fg: "text-[var(--color-tint-green)]",
      bg: "bg-[var(--color-tint-green)]",
    },
    "Local Leaders": {
      fg: "text-[var(--color-tint-purple)]",
      bg: "bg-[var(--color-tint-purple)]",
    },
    "Newspapers & Media": {
      fg: "text-[var(--color-tint-pink)]",
      bg: "bg-[var(--color-tint-pink)]",
    },
  };

  // Always show the four primary categories. "Newspapers & Media" only appears
  // when populated (rare this early in the cycle).
  const REQUIRED: EndorsementCategory[] = [
    "Elected Officials",
    "Unions",
    "Advocacy & Industry",
    "Local Leaders",
  ];
  const visible: EndorsementCategory[] = [
    ...REQUIRED,
    ...(grouped["Newspapers & Media"].length > 0 ? (["Newspapers & Media"] as const) : []),
  ];

  return (
    // 2x2 on small screens, 4-up on large. Newspapers/Media expands to a 5th
    // column on xl+ when populated.
    <div
      className={`grid gap-x-8 gap-y-6 grid-cols-1 sm:grid-cols-2 ${
        visible.length >= 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"
      }`}
    >
      {visible.map((cat) => {
        const items = grouped[cat];
        return (
          <div key={cat} className="min-w-0">
            <div
              className={`font-mono-cap text-[10px] mb-3 flex items-center gap-2 ${categoryTone[cat].fg}`}
            >
              <span className={`w-3 h-px ${categoryTone[cat].bg}`} />
              {cat}
            </div>
            {items.length > 0 ? (
              <ul className="space-y-2">
                {items.map((e, i) => (
                  <li key={i} className="text-[13px] leading-[1.45] text-[var(--color-paper)]">
                    <RichText text={e.name} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] leading-[1.5] italic text-[var(--color-paper-4)]">
                No endorsements in this category yet.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
