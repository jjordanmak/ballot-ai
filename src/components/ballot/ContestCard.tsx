import { ExternalLink } from "lucide-react";
import type { Contest } from "@/domain/ballot";
import { PartyNameTag, StatusPill } from "@/components/PartyTag";
import { SourceLine } from "./SourceLine";

/**
 * One candidate contest (including judicial retention). Shows exactly what
 * the official data says — office, district, how many to vote for, and every
 * choice by its official ballot name. Missing profiles never hide a choice.
 */
export function ContestCard({ contest }: { contest: Contest }) {
  const isRetention = contest.contestType === "retention";
  const voteFor = contest.voteFor;
  return (
    <article
      id={`contest-${contest.id}`}
      className="scroll-mt-20 rounded-xl border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-display text-[22px] sm:text-[24px] leading-[1.15] tracking-[-0.01em] text-balance">
            {contest.title}
          </h3>
          {contest.division.name && contest.division.name !== contest.title && (
            <p className="mt-1 text-[13px] text-[var(--color-paper-3)]">{contest.division.name}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {isRetention ? (
            <StatusPill tone="teal">Retention · Yes / No</StatusPill>
          ) : voteFor ? (
            <StatusPill tone="info">Vote for {voteFor}</StatusPill>
          ) : null}
          {contest.numberElected && contest.numberElected > 1 && (
            <StatusPill>{contest.numberElected} seats</StatusPill>
          )}
          {contest.special && <StatusPill tone="purple">Special election</StatusPill>}
          {contest.contestType === "other" && contest.rawType && <StatusPill>{contest.rawType}</StatusPill>}
        </div>
      </header>

      {contest.electorateSpecifications && (
        <p className="mt-3 text-[13px] text-[var(--color-paper-2)]">{contest.electorateSpecifications}</p>
      )}

      {contest.choices.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed border-[var(--color-ink-4)] px-4 py-3 text-[13px] leading-[1.55] text-[var(--color-paper-2)]">
          Our data source didn{"’"}t list the choices for this contest. Check your official sample ballot for the full list.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--color-ink-3)]">
          {contest.choices.map((c) => (
            <li key={c.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
              <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[16px] text-[var(--color-paper)]">{c.ballotName}</span>
                {c.party && <PartyNameTag name={c.party} />}
                {c.designation && <span className="text-[12px] text-[var(--color-paper-3)]">{c.designation}</span>}
              </div>
              <div className="flex items-center gap-3 text-[12px]">
                {c.urls.campaign ? (
                  <a
                    href={c.urls.campaign}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--color-paper-2)] hover:text-[var(--color-accent)]"
                  >
                    Campaign site <ExternalLink size={11} aria-hidden />
                  </a>
                ) : null}
                <span className="text-[var(--color-paper-4)]">Profile not yet available</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SourceLine sources={contest.sources} />
    </article>
  );
}
