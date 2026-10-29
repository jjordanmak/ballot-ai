import { ArrowUpRight, Info } from "lucide-react";

/**
 * ⓘ after a district name whose map year was split off ("… District - 2022").
 * Same hover/focus tooltip as the district line; tapping focuses it on touch screens.
 */
export function MapYearInfo({ note, id }: { note?: { text: string; source?: { name: string; url: string } }; id: string }) {
  if (!note) return null;
  return (
    <span
      tabIndex={0}
      aria-label="About this district's map"
      aria-describedby={id}
      className="relative group/tip inline-flex items-center align-middle cursor-help text-[var(--color-paper-3)] hover:text-[var(--color-paper)] focus:text-[var(--color-paper)] focus:outline-none normal-case"
    >
      <Info size={11} aria-hidden />
      {/* pt-2 (not mt-2) keeps the pointer inside the group on its way to the source link. */}
      <span
        id={id}
        role="tooltip"
        className="absolute left-0 top-full pt-2 z-50 w-[300px] max-w-[80vw] invisible opacity-0 group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100 transition-opacity duration-150"
      >
        <span className="block rounded-lg bg-[var(--color-ink-0)] border border-[var(--color-ink-3)] shadow-xl p-3 text-left font-sans normal-case tracking-normal text-[12px] leading-[1.5] text-[var(--color-paper-2)]">
        <span className="block mb-1 text-[var(--color-paper)] font-medium">About this district map</span>
        {note.text}
        {note.source && (
          <a
            href={note.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 flex items-center gap-0.5 text-[11px] text-[var(--color-paper-3)] hover:text-[var(--color-accent)]"
          >
            {note.source.name}
            <ArrowUpRight size={10} aria-hidden />
          </a>
        )}
        </span>
      </span>
    </span>
  );
}
