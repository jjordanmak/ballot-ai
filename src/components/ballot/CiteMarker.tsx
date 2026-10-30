"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { SourceDoc } from "@/domain/enrichment";

/**
 * One [n] footnote marker (owner, 2026-10-29). Hover, keyboard focus or a tap
 * opens a card with the exact supporting sentence (when there is one), the
 * source, and a link; Escape or tapping elsewhere closes it. Same hover and
 * focus-within pattern as the district map note, so the link stays reachable.
 *
 * Once opened, the card is positioned against the viewport (fixed), so it
 * floats over the page instead of inside a scrolling row: in the horizontal
 * timeline it used to add a vertical scrollbar (owner, 2026-10-30).
 */
export function CiteMarker({ n, doc, quote }: { n: number; doc: SourceDoc; quote?: string }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  // Keep the card inside the viewport: start it at the marker, shifted left as needed near the right edge.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const vw = document.documentElement.clientWidth;
    const width = Math.min(320, vw * 0.85);
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom, left: Math.min(Math.max(r.left - 12, 8), vw - width - 8) });
  };
  const show = () => {
    place();
    setOpen(true);
  };
  // While open, follow the marker when the page or a row scrolls.
  useEffect(() => {
    if (!open) return;
    const follow = () => place();
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
    };
  }, [open]);
  return (
    <span
      ref={ref}
      className="relative group/cite inline-block align-baseline"
      onPointerEnter={show}
      onPointerLeave={() => !ref.current?.contains(document.activeElement) && setOpen(false)}
      onFocus={show}
      onBlur={() => !ref.current?.matches(":hover") && setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && (document.activeElement as HTMLElement | null)?.blur()}
    >
      <button
        type="button"
        aria-describedby={id}
        aria-label={`Source ${n}: ${doc.publisher}`}
        className="relative font-mono text-[9px] leading-none text-[var(--color-paper-3)] hover:text-[var(--color-accent)] focus:text-[var(--color-accent)] focus:outline-none px-[1px] cursor-pointer after:absolute after:-inset-[7px] after:content-['']"
      >
        [{n}]
      </button>
      {/* pt-2 (not mt-2) keeps the pointer inside the group on its way to the link. */}
      <span
        id={id}
        role="tooltip"
        style={pos ? { position: "fixed", top: pos.top, left: pos.left } : { left: -12 }}
        className="absolute top-full pt-2 z-[200] w-[320px] max-w-[85vw] invisible opacity-0 group-hover/cite:visible group-hover/cite:opacity-100 group-focus-within/cite:visible group-focus-within/cite:opacity-100 transition-opacity duration-150"
      >
        <span className="block rounded-lg bg-[var(--color-ink-0)] border border-[var(--color-ink-3)] shadow-xl p-3 text-left font-sans normal-case tracking-normal text-[12px] leading-[1.5] text-[var(--color-paper-2)] whitespace-normal">
          {quote && <span className="block mb-2 italic text-[var(--color-paper)]">“{quote}”</span>}
          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-0.5 text-[var(--color-paper-2)] hover:text-[var(--color-accent)]">
            <span>
              {doc.publisher}: {doc.title}
            </span>
            <ArrowUpRight size={11} aria-hidden className="mt-[3px] shrink-0" />
          </a>
          <span className="block mt-0.5 text-[11px] text-[var(--color-paper-4)]">
            {doc.official ? "Official source · " : ""}accessed {doc.accessed}
          </span>
        </span>
      </span>
    </span>
  );
}
