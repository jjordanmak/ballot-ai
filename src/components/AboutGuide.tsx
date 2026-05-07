import { ExternalLink, BookOpen } from "lucide-react";
import { ABOUT_GUIDE } from "@/data/races";
import { RichBlock, RichText } from "./Highlight";

export function AboutGuide() {
  return (
    <section id="about-guide" className="mt-32 pb-20 border-t border-[var(--color-ink-3)] pt-16">
      <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mb-4 flex items-center gap-2">
        <BookOpen size={12} className="text-[var(--color-accent)]" />
        About this guide
      </div>

      <h2 className="font-display text-[40px] sm:text-[52px] leading-[0.98] tracking-[-0.02em] text-balance max-w-3xl">
        How this guide was made — and where its sources come from.
      </h2>

      <RichBlock
        text={ABOUT_GUIDE.intro}
        className="mt-6 text-[16px] leading-[1.7] text-[var(--color-paper-2)] max-w-3xl text-pretty"
      />

      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8 max-w-5xl">
        {ABOUT_GUIDE.sources.map((src) => (
          <div key={src.name} className="flex gap-4 py-3 border-b border-[var(--color-ink-3)]">
            <span className="font-mono race-number text-[10px] text-[var(--color-paper-4)] mt-1 w-6 shrink-0 tabular-nums">
              {String(ABOUT_GUIDE.sources.indexOf(src) + 1).padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium text-[var(--color-paper)]">{src.name}</span>
                {src.url && (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-paper-3)] hover:text-[var(--color-accent)] transition-colors"
                    aria-label={`Open ${src.name} in a new tab`}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <div className="text-[12px] text-[var(--color-paper-3)] mt-0.5 leading-relaxed">
                {src.role}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 max-w-3xl">
        <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mb-3">Methodology</div>
        <RichBlock
          text={ABOUT_GUIDE.methodology}
          className="text-[14px] leading-[1.7] text-[var(--color-paper-2)] text-pretty"
        />
      </div>

      <div className="mt-10 flex items-center justify-between gap-4 max-w-3xl pt-6 border-t border-[var(--color-ink-3)]">
        <span className="font-mono-cap text-[10px] text-[var(--color-paper-4)]">
          Last updated · {ABOUT_GUIDE.lastUpdated}
        </span>
        <span className="font-mono-cap text-[10px] text-[var(--color-paper-4)]">
          Election day · June 2, 2026
        </span>
      </div>

      <p className="mt-16 font-display italic text-[var(--color-paper-3)] text-[18px] max-w-2xl text-balance">
        <RichText text={'"<mark>This guide is a compilation, not an endorsement</mark> — your vote is yours."'} />
      </p>
    </section>
  );
}
