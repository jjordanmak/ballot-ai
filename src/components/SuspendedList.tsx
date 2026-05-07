import { AlertOctagon } from "lucide-react";
import type { Candidate } from "@/data/types";
import { RichBlock } from "./Highlight";

/**
 * Per-candidate list of suspended campaigns. Always-expanded — full statement
 * shown inline. Each row: name + party (line 1) + suspended-on date (line 2)
 * on the left; statement on the right.
 */
export function SuspendedList({ candidates }: { candidates: Candidate[] }) {
  if (candidates.length === 0) return null;

  return (
    <div className="md:col-span-12 mt-4 rounded-lg bg-[oklch(70%_0.14_25_/_0.07)] border border-[oklch(70%_0.14_25_/_0.30)] p-6 no-highlights">
      <div className="font-mono-cap text-[11px] text-[var(--color-trend-down)] mb-5 tracking-[0.16em] flex items-center gap-2">
        <AlertOctagon size={12} />
        Suspended Campaigns · {candidates.length}
      </div>
      <ul className="divide-y divide-[oklch(70%_0.14_25_/_0.18)]">
        {candidates.map((c) => (
          <li
            key={c.id}
            className="py-4 first:pt-0 last:pb-0 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-3 sm:gap-6 items-center"
          >
            <div>
              <div className="text-[14px] font-medium text-[var(--color-paper)]">
                {c.name}
              </div>
              <div className="font-mono-cap text-[9px] text-[var(--color-trend-down)] tracking-[0.16em] mt-1">
                {c.party}
              </div>
              <div className="font-mono-cap text-[9px] text-[var(--color-paper-3)] tracking-[0.16em] mt-0.5">
                Suspended {c.campaignSuspended?.date}
              </div>
            </div>
            <RichBlock
              text={c.campaignSuspended?.note ?? ""}
              className="text-[13px] text-[var(--color-paper-2)] leading-relaxed"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
