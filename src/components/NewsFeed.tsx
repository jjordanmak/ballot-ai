"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Newspaper,
  AtSign,
  BarChart3,
  Award,
  ArrowUpRight,
  RadioTower,
  ChevronLeft,
  ChevronRight,
  Play,
  Heart,
  MessageCircle,
  Repeat2,
  Instagram,
  Facebook,
} from "lucide-react";
import type { FeedTarget, NewsItem, NewsItemType, SocialPlatform } from "@/data/types";
import { useFeedItems, useFeedPaging, useRenderedAt } from "./ballot/LiveFeed";
import { FEED_PAGE } from "@/lib/feeds/paging";
import { newsTopics } from "@/lib/feeds/topics";
import { NewsTags } from "./NewsTags";

const TYPE_META: Record<
  NewsItemType,
  { label: string; icon: React.ReactNode; tone: string; bg: string }
> = {
  news: {
    label: "News",
    icon: <Newspaper size={11} />,
    tone: "text-[var(--color-tint-teal)]",
    bg: "bg-[var(--color-tint-teal-soft)]",
  },
  social: {
    label: "Social",
    icon: <AtSign size={11} />,
    tone: "text-[var(--color-tint-purple)]",
    bg: "bg-[var(--color-tint-purple-soft)]",
  },
  poll: {
    label: "Poll",
    icon: <BarChart3 size={11} />,
    tone: "text-[var(--color-tint-orange)]",
    bg: "bg-[var(--color-tint-orange-soft)]",
  },
  endorsement: {
    label: "Endorsement",
    icon: <Award size={11} />,
    tone: "text-[var(--color-tint-green)]",
    bg: "bg-[var(--color-tint-green-soft)]",
  },
};

/** Renders a platform-faithful logo. We use lucide where it ships an
 *  official mark (Instagram, Facebook), and a stylized character for
 *  platforms that don't have a clean lucide icon. */
function PlatformGlyph({ platform, size = 14 }: { platform: SocialPlatform; size?: number }) {
  switch (platform) {
    case "Instagram":
      return <Instagram size={size} strokeWidth={1.75} />;
    case "Facebook":
      return <Facebook size={size} strokeWidth={1.75} />;
    case "X":
      return <span style={{ fontSize: size + 2, lineHeight: 1 }}>𝕏</span>;
    case "Truth Social":
      return <span className="font-display" style={{ fontSize: size, lineHeight: 1 }}>TS</span>;
    case "Threads":
      return <span style={{ fontSize: size, lineHeight: 1 }}>@</span>;
    case "Bluesky":
      return <span style={{ fontSize: size, lineHeight: 1 }}>🦋</span>;
    default:
      return null;
  }
}

/**
 * "11 hr ago" relative to `now`; older items (or no clock yet) print the
 * date, in `timeZone` when given, else the viewer's own. Never reads the
 * clock itself, so the server render and hydration can agree (React #418).
 */
export function formatNewsDate(input: string, now: number | null, timeZone?: string): string {
  if (!/T|Z/.test(input)) return input;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const absolute = () => date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
  if (now === null) return absolute();

  const diffMs = now - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return absolute();
}

/**
 * The clock news dates are measured against. Until mount it's the server's
 * render time in UTC (identical on both sides); after mount, the browser's
 * clock and time zone, refreshed whenever the items change.
 */
function useNewsClock(items: unknown): { now: number | null; timeZone?: string } {
  const renderedAt = useRenderedAt();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, [items]);
  return now !== null ? { now } : { now: renderedAt ?? null, timeZone: "UTC" };
}

/** Build a CSS mask-image for the carousel based on which edges are
 * scrollable. Fades the content (cards) at the edge instead of overlaying
 * a colored gradient — works against any background and never produces
 * a hard seam. */
function buildMask(canLeft: boolean, canRight: boolean): string {
  if (!canLeft && !canRight) return "none";
  const left = canLeft ? "transparent 0, black 4%" : "black 0";
  const right = canRight ? "black 96%, transparent 100%" : "black 100%";
  return `linear-gradient(to right, ${left}, ${right})`;
}

function formatCount(n?: number): string | null {
  if (n == null) return null;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}K`.replace(".0K", "K");
  return `${(n / 1_000_000).toFixed(1)}M`.replace(".0M", "M");
}

/** Build a profile-fallback URL when the news item doesn't carry the
 *  exact post permalink. Until we ingest real tweet/post IDs, the card
 *  will at least click through to the candidate's profile on the right
 *  platform. */
function fallbackSocialUrl(platform: SocialPlatform, handle: string): string {
  switch (platform) {
    case "X":
      return `https://x.com/${handle}`;
    case "Truth Social":
      return `https://truthsocial.com/@${handle}`;
    case "Threads":
      return `https://www.threads.net/@${handle}`;
    case "Bluesky":
      return `https://bsky.app/profile/${handle}`;
    case "Instagram":
      return `https://www.instagram.com/${handle}`;
    case "Facebook":
      return `https://www.facebook.com/${handle}`;
    default:
      return "#";
  }
}

export function NewsFeed({
  items,
  fallbackAvatar,
  feed,
  hideWhenEmpty,
}: {
  items: NewsItem[] | undefined;
  fallbackAvatar?: string;
  /** Address-first ballot: read live feed_items from the page's LiveFeedProvider. */
  feed?: FeedTarget;
  hideWhenEmpty?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fromFeed = useFeedItems(feed);
  const paging = useFeedPaging(feed);
  const [archiveItems, setLiveItems] = useState<NewsItem[]>(items ?? []);
  const liveItems = fromFeed ?? archiveItems;
  const clock = useNewsClock(liveItems);
  // A candidate's own carousel is already about them: mentions show on race and measure carousels only.
  const showMentions = !feed?.candidateId;
  const [canLeft, setCanLeft] = useState(false);
  // Off until we've measured: nothing to scroll means both buttons stay disabled.
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    setLiveItems(items ?? []);
  }, [items]);

  const empty = liveItems.length === 0;
  const updateAffordance = useCallback(() => {
    const el = scrollRef.current;
    if (!el || empty) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, [empty]);

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
  }, [liveItems, updateAffordance]);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir === "right" ? el.clientWidth * 0.7 : -el.clientWidth * 0.7,
      behavior: "smooth",
    });
    window.setTimeout(updateAffordance, 350);
  };

  // Older stories load as the carousel nears its end, about 1 card early.
  const loadOlder = paging?.loadOlder;
  const canPage = !!paging && !paging.done;
  useEffect(() => {
    const root = scrollRef.current;
    const end = endRef.current;
    if (!canPage || !root || !end || !loadOlder) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && loadOlder(), { root, rootMargin: "0px 400px 0px 0px" });
    io.observe(end);
    return () => io.disconnect();
  }, [canPage, loadOlder, liveItems.length]);

  // A candidate's carousel is a slice of its race's stories, so it can start short:
  // fetch its own first page once it scrolls into view.
  const short = !!feed?.candidateId && !!paging && !paging.started && liveItems.length < FEED_PAGE;
  useEffect(() => {
    const el = sectionRef.current;
    if (!short || !el || !loadOlder) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && loadOlder(), { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [short, loadOlder]);

  const sorted = liveItems
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  if (hideWhenEmpty && !sorted.length) {
    // Nothing to show yet; keep an invisible anchor while a candidate's first page may still bring stories.
    return short || paging?.loading ? <section ref={sectionRef} aria-hidden className="h-px" /> : null;
  }

  return (
    <section ref={sectionRef}>
      <div className="mb-6 flex items-center gap-3">
        <div className="font-mono-cap text-[11px] text-[var(--color-paper)] flex items-center gap-2.5 flex-1 tracking-[0.16em]">
          <RadioTower size={12} className="text-[var(--color-accent)]" />
          In the news
          <LivePill />
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
            aria-label="Scroll feed left"
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
            aria-label="Scroll feed right"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {sorted.length === 0 && !paging?.loading ? (
        <div className="rounded-xl border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] px-6 py-7">
          <div className="font-mono text-[13px] font-bold text-[var(--color-paper-2)]">
            No recent news in our feed yet.
          </div>
          <div className="font-mono text-[12px] text-[var(--color-paper-2)] mt-1">
            Live coverage rolls in here as it&rsquo;s published.
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* CSS mask-image fades the carousel content itself at the edges.
              No overlay div / no color-matching → no harsh seam where the
              fade stops. Mask sides toggle with scroll affordance: only
              fade where there's actually scrollable content beyond. */}
          <div
            ref={scrollRef}
            className="overflow-x-auto scrollbar-hide"
            style={{
              WebkitMaskImage: buildMask(canLeft, canRight),
              maskImage: buildMask(canLeft, canRight),
              transition: "mask-image 200ms, -webkit-mask-image 200ms",
            }}
          >
            {/* Single-row carousel: each card stands alone in its own
                column, scrolling horizontally. */}
            <div className="flex items-stretch gap-4 min-w-min py-1">
              {sorted.map((item) => (
                <NewsCard
                  key={item.id}
                  item={item}
                  fallbackAvatar={fallbackAvatar}
                  clock={clock}
                  showMentions={showMentions}
                />
              ))}
              {paging?.loading && <NewsCardSkeleton />}
              {canPage && <div ref={endRef} aria-hidden className="w-px shrink-0" />}
            </div>
          </div>
          {/* NYT API terms ask for this credit wherever its results appear (owner, 2026-10-30). */}
          {sorted.some((i) => i.source === "The New York Times") && (
            <p className="mt-3 text-[11px] text-[var(--color-paper-4)]">
              <a href="https://developer.nytimes.com" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-accent)]">
                Data provided by The New York Times
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}


/** Stands in for the next stories while they load: a NewsCard's size and surface, no content. */
function NewsCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading older stories"
      className="flex flex-col gap-3 shrink-0 w-[85vw] sm:w-[360px] rounded-xl border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] p-5 animate-pulse"
    >
      <div className="h-3 w-1/3 rounded bg-[var(--color-ink-3)]" />
      <div className="h-4 w-11/12 rounded bg-[var(--color-ink-3)]" />
      <div className="h-4 w-3/4 rounded bg-[var(--color-ink-3)]" />
      <div className="h-3 w-1/4 rounded bg-[var(--color-ink-3)] mt-auto" />
    </div>
  );
}

function LivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-tint-green-soft)] text-[var(--color-tint-green)] px-2 py-0.5 normal-case">
      <span className="relative flex w-1.5 h-1.5">
        <span className="absolute inset-0 rounded-full bg-[var(--color-tint-green)] opacity-60 animate-ping" />
        <span className="relative w-1.5 h-1.5 rounded-full bg-[var(--color-tint-green)]" />
      </span>
      <span className="font-mono uppercase text-[9px] tracking-[0.2em]">Live</span>
    </span>
  );
}

function NewsCard({
  item,
  fallbackAvatar,
  clock,
  showMentions,
}: {
  item: NewsItem;
  fallbackAvatar?: string;
  clock: { now: number | null; timeZone?: string };
  showMentions?: boolean;
}) {
  const meta = TYPE_META[item.type] ?? TYPE_META.news;
  const isSocial = item.type === "social" && item.social;
  // Resolve the click-through URL: explicit on the item OR a fallback to
  // the candidate's profile on the right platform. Every social card is
  // now clickable.
  const resolvedUrl =
    item.url ??
    (isSocial && item.social
      ? fallbackSocialUrl(item.social.platform, item.social.handle)
      : undefined);
  const Element = resolvedUrl ? "a" : "div";
  const dateStr = formatNewsDate(item.date, clock.now, clock.timeZone);

  // Source label:
  //   social: "@handle · Platform"
  //   else:   monospace publication name (rendered in muted gray below)
  const sourceDisplay = isSocial
    ? `@${item.social!.handle} · ${item.social!.platform}`
    : item.source;

  // Cards width up a bit when they contain media so reels/photos breathe.
  const widerForMedia = isSocial && item.social!.media && item.social!.media.length > 0;

  return (
    <Element
      {...(resolvedUrl
        ? { href: resolvedUrl, target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className={`flex flex-col shrink-0 ${
        widerForMedia ? "w-[85vw] sm:w-[380px]" : "w-[85vw] sm:w-[360px]"
      } rounded-xl border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] p-5 transition-colors ${
        resolvedUrl ? "hover:border-[var(--color-paper-4)]" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1 rounded-full font-mono-cap text-[9px] px-2 py-0.5 ${meta.bg} ${meta.tone} shrink-0 tracking-[0.16em]`}
          >
            {meta.icon}
            {meta.label}
          </span>
          {/* Source — gray + monospace per spec */}
          <span className="font-mono text-[11px] text-[var(--color-paper-3)] truncate">
            {sourceDisplay}
          </span>
        </div>
        <span className="font-mono text-[11px] text-[var(--color-paper-3)] whitespace-nowrap">
          {dateStr}
        </span>
      </div>

      {isSocial && item.social ? (
        <SocialEmbed item={item} fallbackAvatar={fallbackAvatar} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="text-[14px] leading-[1.4] font-medium text-[var(--color-paper)] line-clamp-3 flex-1">
              {item.title}
            </div>
            {resolvedUrl && (
              <ArrowUpRight
                size={14}
                className="shrink-0 text-[var(--color-paper-3)] mt-0.5"
              />
            )}
          </div>
          {item.excerpt && (
            <div className="text-[12px] leading-[1.5] text-[var(--color-paper-3)] line-clamp-4">
              {item.excerpt}
            </div>
          )}
        </>
      )}
      <NewsTags mentions={showMentions ? item.mentions : undefined} topics={newsTopics(item.title, item.excerpt)} />
    </Element>
  );
}

/**
 * Social card body — supports the major formats:
 *   • Plain text post
 *   • Post with attached image(s) (single or 2x2 grid)
 *   • Post with video (with play overlay)
 *   • Reels / short vertical video (9:16 aspect)
 *   • Inline poll
 * Plus an engagement footer (likes/reposts/replies) when present.
 */
function SocialEmbed({
  item,
  fallbackAvatar,
}: {
  item: NewsItem;
  fallbackAvatar?: string;
}) {
  const social = item.social!;
  const avatar = social.avatar ?? fallbackAvatar;
  const initials = item.source
    .split(" ")
    .map((p) => p[0])
    .filter((c) => /[A-Za-z]/.test(c ?? ""))
    .slice(0, 2)
    .join("");

  return (
    <div className="flex flex-col flex-1 gap-3">
      {/* Author row */}
      <div className="flex items-center gap-3">
        <div className="relative w-9 h-9 rounded-full overflow-hidden bg-[var(--color-ink-2)] shrink-0 border border-[var(--color-ink-3)]">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--color-paper-3)] text-[11px] font-display">
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--color-paper)] truncate leading-tight">
            {item.source}
          </div>
          <div className="font-mono text-[10px] text-[var(--color-paper-3)] truncate leading-tight mt-0.5">
            @{social.handle}
          </div>
        </div>
        <span
          className="shrink-0 w-7 h-7 rounded-full bg-[var(--color-ink-2)] flex items-center justify-center text-[var(--color-paper-2)]"
          title={social.platform}
          aria-label={social.platform}
        >
          <PlatformGlyph platform={social.platform} />
        </span>
      </div>

      {/* Post body */}
      <div className="text-[13px] leading-[1.5] text-[var(--color-paper)] line-clamp-5">
        {item.title}
      </div>

      {/* Attached media */}
      {social.media && social.media.length > 0 && <SocialMediaGrid media={social.media} isReel={social.isReel} />}

      {/* Inline poll */}
      {social.poll && <SocialPoll poll={social.poll} />}

      {/* Engagement footer */}
      {(social.likes != null || social.reposts != null || social.replies != null) && (
        <div className="mt-auto pt-3 flex items-center gap-4 text-[11px] text-[var(--color-paper-3)] border-t border-[var(--color-ink-3)] font-mono">
          {social.replies != null && (
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle size={11} />
              {formatCount(social.replies)}
            </span>
          )}
          {social.reposts != null && (
            <span className="inline-flex items-center gap-1.5">
              <Repeat2 size={11} />
              {formatCount(social.reposts)}
            </span>
          )}
          {social.likes != null && (
            <span className="inline-flex items-center gap-1.5">
              <Heart size={11} />
              {formatCount(social.likes)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SocialMediaGrid({
  media,
  isReel,
}: {
  media: NonNullable<NonNullable<NewsItem["social"]>["media"]>;
  isReel?: boolean;
}) {
  const m = media[0];
  // Reels render as a tall 9:16 thumbnail with a big play overlay.
  if (isReel && m.type === "video") {
    return (
      <div className="relative w-[150px] aspect-[9/16] mx-auto rounded-lg overflow-hidden bg-[var(--color-ink-0)] border border-[var(--color-ink-3)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
        <div className="absolute inset-0 flex items-center justify-center bg-[oklch(0%_0_0_/_0.30)]">
          <span className="w-10 h-10 rounded-full bg-[oklch(100%_0_0_/_0.92)] flex items-center justify-center text-[var(--color-ink-0)]">
            <Play size={16} className="ml-0.5" fill="currentColor" />
          </span>
        </div>
        {m.durationSec != null && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-[oklch(0%_0_0_/_0.6)] text-[10px] text-[var(--color-paper)] font-mono">
            {Math.floor(m.durationSec / 60)}:{String(m.durationSec % 60).padStart(2, "0")}
          </span>
        )}
      </div>
    );
  }
  // Single video → 16:9 thumbnail with play overlay
  if (m.type === "video") {
    return (
      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-[var(--color-ink-0)] border border-[var(--color-ink-3)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
        <div className="absolute inset-0 flex items-center justify-center bg-[oklch(0%_0_0_/_0.30)]">
          <span className="w-12 h-12 rounded-full bg-[oklch(100%_0_0_/_0.92)] flex items-center justify-center text-[var(--color-ink-0)]">
            <Play size={18} className="ml-0.5" fill="currentColor" />
          </span>
        </div>
        {m.durationSec != null && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-[oklch(0%_0_0_/_0.6)] text-[10px] text-[var(--color-paper)] font-mono">
            {Math.floor(m.durationSec / 60)}:{String(m.durationSec % 60).padStart(2, "0")}
          </span>
        )}
      </div>
    );
  }
  // Single image
  if (media.length === 1) {
    return (
      <div className="rounded-lg overflow-hidden border border-[var(--color-ink-3)] aspect-video bg-[var(--color-ink-0)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.url} alt={m.alt ?? ""} className="w-full h-full object-cover" />
      </div>
    );
  }
  // 2-4 image grid (mirrors X's layout)
  return (
    <div
      className={`grid gap-1 rounded-lg overflow-hidden border border-[var(--color-ink-3)] ${
        media.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2"
      }`}
    >
      {media.slice(0, 4).map((mm, i) =>
        mm.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={mm.url} alt={mm.alt ?? ""} className="w-full h-32 object-cover" />
        ) : null
      )}
    </div>
  );
}

function SocialPoll({
  poll,
}: {
  poll: NonNullable<NonNullable<NewsItem["social"]>["poll"]>;
}) {
  return (
    <div className="space-y-2">
      {poll.options.map((opt, i) => (
        <div key={i} className="relative rounded-md overflow-hidden border border-[var(--color-ink-3)]">
          <div
            className="absolute inset-y-0 left-0 bg-[var(--color-tint-purple-soft)]"
            style={{ width: `${opt.pct}%` }}
          />
          <div className="relative flex items-center justify-between px-3 py-1.5 text-[12px] text-[var(--color-paper)]">
            <span className="truncate">{opt.label}</span>
            <span className="font-mono race-number tabular-nums text-[var(--color-paper-2)] ml-2">
              {opt.pct}%
            </span>
          </div>
        </div>
      ))}
      <div className="font-mono text-[10px] text-[var(--color-paper-3)] flex items-center gap-3">
        {poll.totalVotes != null && (
          <span>{poll.totalVotes.toLocaleString()} votes</span>
        )}
        <span className={poll.closed ? "" : "text-[var(--color-tint-green)]"}>
          {poll.closed ? "Closed" : "Open"}
        </span>
      </div>
    </div>
  );
}
