"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownToLine, GripHorizontal, Columns3, Eye, EyeOff, RotateCcw, Info } from "lucide-react";
import type { Race, Candidate } from "@/data/types";
import { partyClass, partyDot, partyBorder, partyLabel, StatusPill } from "./PartyTag";
import { RichText } from "./Highlight";
import { TrendArrow } from "./CandidateProfile";

interface Props {
  race: Race;
}

/**
 * Initial visible set: respect candidate.major flag for "larger elections"
 * (more than 5 active candidates) — otherwise show everyone.
 */
function initialVisible(race: Race): string[] {
  const active = race.candidates.filter((c) => !c.withdrawn && !c.campaignSuspended);
  if (active.length > 5) return active.filter((c) => c.major).map((c) => c.id);
  return active.map((c) => c.id);
}

export function ComparisonTable({ race }: Props) {
  const allCandidates = race.candidates.filter((c) => !c.withdrawn && !c.campaignSuspended);

  const [order, setOrder] = useState<string[]>(allCandidates.map((c) => c.id));
  const [visible, setVisible] = useState<Set<string>>(new Set(initialVisible(race)));

  // Refs for the dual-table architecture:
  //   bodyRef = the horizontally-scrollable container around <tbody>
  //   headerRef = the (overflow-hidden) container around <thead>; we sync its
  //   scrollLeft to the body's so the columns line up while body scrolls.
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    const header = headerRef.current;
    if (!body || !header) return;
    const onBodyScroll = () => {
      header.scrollLeft = body.scrollLeft;
    };
    body.addEventListener("scroll", onBodyScroll, { passive: true });
    return () => body.removeEventListener("scroll", onBodyScroll);
  }, [visible, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const candidatesById = useMemo(
    () => Object.fromEntries(allCandidates.map((c) => [c.id, c] as const)),
    [allCandidates]
  );

  const visibleOrdered = useMemo(
    () =>
      order
        .filter((id) => visible.has(id))
        .map((id) => candidatesById[id])
        .filter(Boolean),
    [order, visible, candidatesById]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const toggle = (id: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showAllToggles = () => setVisible(new Set(allCandidates.map((c) => c.id)));
  const hideAllToggles = () => setVisible(new Set());
  const resetToggles = () => {
    setOrder(allCandidates.map((c) => c.id));
    setVisible(new Set(initialVisible(race)));
  };

  if (allCandidates.length < 2) return null;

  const tableMinWidth = visibleOrdered.length * 300 + 180;

  return (
    <section className="mt-16">
      {/* STICKY GROUP — eyebrow, heading, explainer, AND the toolbar (chips
          + thead) pin together at the top of the viewport as a single
          unit. Combining them into one sticky element means the gap
          between header content and toolbar is internal padding (pb-5 on
          the inner header block) — it scrolls with them, never separates
          on scroll, never needs CSS-variable coordination. */}
      <div className="sticky top-14 lg:top-0 z-[100] bg-[var(--color-ink-0)] pt-8">
        {/* Eyebrow row — eyebrow on the left, Show/Hide/Reset controls on
            the right (mirrors the candidate-profiles section's eyebrow +
            Expand/Collapse pattern). mb-8 below this row matches the
            news heading-to-content spacing. */}
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div className="font-mono-cap text-[11px] text-[var(--color-paper)] flex items-center gap-2 tracking-[0.16em]">
            <Columns3 size={12} className="text-[var(--color-accent)]" />
            Side-by-side
            <span
              tabIndex={0}
              className="relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[var(--color-paper-3)] hover:text-[var(--color-paper)] focus:text-[var(--color-paper)] cursor-help group/tip ml-0.5"
              aria-label="About the comparison"
            >
              <Info size={11} />
              <span
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full mt-2 w-[320px] z-50 opacity-0 group-hover/tip:opacity-100 group-focus/tip:opacity-100 transition-opacity duration-150 rounded-lg bg-[var(--color-ink-0)] border border-[var(--color-ink-3)] shadow-xl p-3 text-left"
              >
                <span className="block text-[11px] text-[var(--color-paper-2)] leading-snug normal-case tracking-normal">
                  We compare the major candidates in this race
                  side-by-side on the policy issues that matter most for
                  this office. Positions are drawn from candidate
                  statements, debates, voting records, and public
                  interviews — never inferred. Suspended and withdrawn
                  candidates are excluded even when they remain on
                  printed ballots. This race compares{" "}
                  {allCandidates.length} candidate
                  {allCandidates.length === 1 ? "" : "s"} across{" "}
                  {race.issues.length} issue
                  {race.issues.length === 1 ? "" : "s"}.
                </span>
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={showAllToggles}
              className="font-mono-cap text-[10px] text-[var(--color-paper-3)] hover:text-[var(--color-accent)] flex items-center gap-1.5 tracking-[0.18em] transition-colors whitespace-nowrap"
            >
              <Eye size={11} />
              Show all
            </button>
            <button
              type="button"
              onClick={hideAllToggles}
              className="font-mono-cap text-[10px] text-[var(--color-paper-3)] hover:text-[var(--color-accent)] flex items-center gap-1.5 tracking-[0.18em] transition-colors whitespace-nowrap"
            >
              <EyeOff size={11} />
              Hide all
            </button>
            <button
              type="button"
              onClick={resetToggles}
              className="font-mono-cap text-[10px] text-[var(--color-paper-3)] hover:text-[var(--color-accent)] flex items-center gap-1.5 tracking-[0.18em] transition-colors whitespace-nowrap"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          </div>
        </div>

        {/* Toolbar chrome (chips area + thead) lives inside the same
            sticky group — fully opaque so body cells disappear behind
            it on scroll. */}
        <div className="bg-[var(--color-ink-0)] border border-[var(--color-ink-3)] rounded-t-lg">
        {/* Chips on the LEFT (free to wrap to multiple rows), microcopy
            on the RIGHT, vertically centered with the chips. The
            Show/Hide/Reset action group lives in the eyebrow row above
            so the toolbar interior is just chips + their behavior label. */}
        <div className="px-5 pt-5 pb-4">
          <DndContext
            id={`compare-${race.id}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap gap-2.5 items-center">
                {order.map((id) => {
                  const c = candidatesById[id];
                  if (!c) return null;
                  return (
                    <SortableChip
                      key={id}
                      candidate={c}
                      visible={visible.has(id)}
                      onToggle={() => toggle(id)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-3 font-mono-cap text-[10px] text-[var(--color-paper-4)] tracking-[0.16em]">
            Drag to reorder · Click to toggle
          </div>
        </div>

        {/* Column-header strip — overflow:hidden so the header doesn't extend
            past the toolbar; JS keeps its scrollLeft synced to the body. */}
        {visibleOrdered.length > 0 && (
          <div ref={headerRef} className="overflow-hidden border-t border-[var(--color-ink-3)]">
            <table
              className="border-collapse"
              style={{ minWidth: tableMinWidth, width: tableMinWidth }}
            >
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 w-[180px] min-w-[180px] p-4 text-left align-top glass-tier after:content-[''] after:absolute after:top-0 after:bottom-0 after:right-[-1px] after:w-px after:bg-[var(--color-ink-3)]">
                    <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)]">Issue</div>
                  </th>
                  {visibleOrdered.map((c) => (
                    <th
                      key={c.id}
                      className="border-r last:border-r-0 border-[var(--color-ink-3)] min-w-[300px] w-[300px] align-top"
                    >
                      <CandidateColHeader candidate={c} raceId={race.id} />
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
        )}
        </div>
      </div>

      {/* BODY — its own horizontal scroll container, sized to parent. */}
      {visibleOrdered.length === 0 ? (
        <div className="rounded-b-lg border border-t-0 border-[var(--color-ink-3)] p-8 text-center text-[var(--color-paper-3)] text-sm">
          No candidates selected. Click a chip above to add one to the comparison.
        </div>
      ) : (
        <div
          ref={bodyRef}
          className="overflow-x-auto rounded-b-lg border border-t-0 border-[var(--color-ink-3)]"
        >
          <table
            className="border-collapse"
            style={{ minWidth: tableMinWidth, width: tableMinWidth }}
          >
            <tbody>
              {race.issues.map((issue, i) => (
                <tr
                  key={issue.id}
                  className={i % 2 ? "bg-[var(--color-ink-1)]" : "bg-[var(--color-ink-0)]"}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 align-top w-[180px] min-w-[180px] border-b border-[var(--color-ink-3)] p-4 text-left bg-inherit after:content-[''] after:absolute after:top-0 after:bottom-0 after:right-[-1px] after:w-px after:bg-[var(--color-ink-3)]"
                  >
                    <div className="font-mono-cap text-[11px] text-[var(--color-paper-2)] leading-tight">
                      {issue.label}
                    </div>
                  </th>
                  {visibleOrdered.map((c) => {
                    const pos = c.issues[issue.id];
                    return (
                      <td
                        key={c.id}
                        className="align-top border-b border-r last:border-r-0 border-[var(--color-ink-3)] p-4 min-w-[300px] w-[300px]"
                      >
                        {pos ? (
                          <>
                            <RichText
                              text={pos.stance}
                              className="text-[13px] leading-relaxed text-[var(--color-paper)] text-pretty"
                            />
                            {pos.source && (
                              <div className="mt-2 font-mono-cap text-[9px] text-[var(--color-paper-4)]">
                                {pos.source}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-[12px] italic text-[var(--color-paper-4)]">
                            No public position on file.
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SortableChip({
  candidate,
  visible,
  onToggle,
}: {
  candidate: Candidate;
  visible: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: candidate.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  // Last name only — keeps chips compact enough to fit on one row.
  const last = candidate.name.split(" ").slice(-1)[0];

  // Drag listeners are bound to the WHOLE pill (the outer div). The
  // dnd-kit PointerSensor has a 4px activation distance, so a click
  // (zero-displacement pointerup) is forwarded to the inner button as
  // a normal toggle click.
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-pressed={visible}
      aria-label={`${visible ? "Hide" : "Show"} ${candidate.name}`}
      title={`${candidate.name} — drag to reorder, click to toggle`}
      // Always carry a border so the pill's box dimensions don't shift when
      // toggled. The visible state uses a transparent border so the size
      // matches the off state's colored border exactly.
      className={`group inline-flex items-center gap-1.5 cursor-grab active:cursor-grabbing select-none rounded-full transition-colors text-[12px] font-medium pl-2 pr-3 py-1 border ${
        visible
          ? `${partyClass(candidate.party)} border-transparent`
          : `bg-transparent ${partyBorder(candidate.party)} text-[var(--color-paper-3)] opacity-60`
      }`}
    >
      <GripHorizontal size={10} className="opacity-50 shrink-0" aria-hidden="true" />
      <span className="leading-none whitespace-nowrap">{last}</span>
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          visible ? partyDot(candidate.party) : "bg-transparent border " + partyBorder(candidate.party)
        }`}
      />
    </div>
  );
}

function CandidateColHeader({ candidate, raceId }: { candidate: Candidate; raceId: string }) {
  const isSuspended = !!candidate.campaignSuspended;
  return (
    <div className="p-4 text-left">
      {/* Top row: name + jump-to-profile, sized to match the name's first-line height */}
      <div className="flex items-start justify-between gap-2">
        <div className="font-display text-[20px] leading-[1.1] text-balance flex-1 min-w-0">
          {candidate.name}
        </div>
        <a
          href={`#candidate-${raceId}-${candidate.id}`}
          className="shrink-0 h-[22px] w-[22px] rounded-full bg-[var(--color-ink-2)] hover:bg-[var(--color-accent)] flex items-center justify-center text-[var(--color-paper-2)] hover:text-[var(--color-ink-0)] transition-colors"
          aria-label={`Jump to ${candidate.name}'s profile`}
          title="Jump to profile"
        >
          <ArrowDownToLine size={11} />
        </a>
      </div>

      {/* Party pill (full name) */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-mono-cap text-[10px] px-2 py-0.5 ${partyClass(candidate.party)}`}
        >
          <span className={`w-1 h-1 rounded-full ${partyDot(candidate.party)}`} />
          {partyLabel(candidate.party)}
        </span>
      </div>

      {/* Polling status pill — with trend arrow */}
      <div className="mt-1.5">
        <StatusPill tone={isSuspended ? "warn" : "default"} size="xs">
          <span>
            {candidate.pollingStatus}
            {!isSuspended && candidate.pollingPct != null && ` · ${candidate.pollingPct}%`}
          </span>
          {!isSuspended && candidate.trend && <TrendArrow trend={candidate.trend} />}
        </StatusPill>
      </div>
    </div>
  );
}
