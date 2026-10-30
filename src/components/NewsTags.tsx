import { Tag, UserRound } from "lucide-react";

/** Names shown before the rest collapse into "+N" (all of them stay in the tooltip and for screen readers). */
const MAX_MENTIONS = 3;

const CHIP =
  "inline-flex items-center gap-1 rounded-full border border-[var(--color-ink-3)] bg-[var(--color-ink-2)] px-2 py-0.5 font-mono text-[10px] leading-[1.4] text-[var(--color-paper-3)] max-w-full";

/**
 * Why a story is on this ballot, in facts only, on two rows so neither buries
 * the other: the candidates it mentions (ballot names, ballot order), then up
 * to two topics from a fixed list. Every chip is the same neutral gray: no
 * party color, no sentiment, no ranking.
 */
export function NewsTags({ mentions = [], topics = [] }: { mentions?: string[]; topics?: string[] }) {
  if (!mentions.length && !topics.length) return null;
  const shown = mentions.slice(0, MAX_MENTIONS);
  const rest = mentions.slice(shown.length);
  return (
    <div className="mt-auto pt-4 flex flex-col gap-1.5" data-news-tags>
      {mentions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-news-mentions>
          <span className="sr-only">Mentions: {mentions.join(", ")}.</span>
          {shown.map((name) => (
            <span key={name} className={CHIP} aria-hidden>
              <UserRound size={10} className="shrink-0" />
              <span className="truncate">{name}</span>
            </span>
          ))}
          {rest.length > 0 && (
            <span className={CHIP} title={rest.join(", ")} aria-hidden>
              +{rest.length}
            </span>
          )}
        </div>
      )}
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-news-topics>
          <span className="sr-only">Topics: {topics.join(", ")}.</span>
          {topics.map((t) => (
            <span key={t} className={CHIP} aria-hidden>
              <Tag size={10} className="shrink-0" />
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
