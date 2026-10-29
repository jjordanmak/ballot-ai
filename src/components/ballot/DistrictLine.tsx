import type { DistrictKind, DistrictRef } from "@/domain/ballot";
import { STATE_NAMES } from "@/domain/categorize";

/** States whose lower house is called the Assembly. */
const ASSEMBLY_STATES = new Set(["CA", "NV", "NY", "WI"]);

function ordinal(n: string): string {
  const v = Number(n);
  if (!Number.isInteger(v)) return n;
  const s = ["th", "st", "nd", "rd"];
  const r = v % 100;
  return `${v}${s[(r - 20) % 10] || s[r] || s[0]}`;
}

interface Item {
  label: string;
  title: string;
  body: string;
}

function districtItem(d: DistrictRef, state: string | undefined, onBallot: boolean): Item {
  const st = state ?? "";
  const stateName = STATE_NAMES[st] ?? "the state";
  const race = onBallot ? " That race is on this ballot." : " There's no race for this seat on this ballot.";
  const kinds: Record<DistrictKind, () => Item> = {
    congressional: () => ({
      label: `${st ? `${st}-` : "CD-"}${d.number}`,
      title: `${stateName}'s ${ordinal(d.number)} Congressional District`,
      body: `Voters here elect one member of the U.S. House of Representatives.${race}`,
    }),
    state_lower: () => {
      const assembly = ASSEMBLY_STATES.has(st);
      return {
        label: `${assembly ? "AD" : "HD"}-${d.number}`,
        title: `${assembly ? "Assembly" : "State House"} District ${d.number}`,
        body: `Voters here elect one member of the ${assembly ? `${stateName} State Assembly` : `${stateName} legislature's lower house`}.${race}`,
      };
    },
    state_upper: () => ({
      label: `SD-${d.number}`,
      title: `State Senate District ${d.number}`,
      body: `Voters here elect one member of the ${stateName} State Senate.${race}`,
    }),
    board_of_equalization: () => ({
      label: `BOE-${d.number}`,
      title: `State Board of Equalization District ${d.number}`,
      body: `Voters here elect one member of the ${stateName} State Board of Equalization, an elected state tax board.${race}`,
    }),
  };
  return kinds[d.kind]();
}

/**
 * "SAN MATEO COUNTY · CA-15 · AD-19 · SD-11 · BOE-2", each with a hover/focus
 * explanation. `onBallot` lists the district kinds that have a race on this
 * ballot, so the explanation can say whether that seat is being voted on.
 */
export function DistrictLine({
  county,
  state,
  districts,
  onBallot,
}: {
  county?: string;
  state?: string;
  districts: DistrictRef[];
  onBallot: ReadonlySet<DistrictKind>;
}) {
  const items: Item[] = [
    ...(county
      ? [
          {
            label: county,
            title: county,
            body: "The county runs the election at this address. Its elections office has your official sample ballot.",
          },
        ]
      : []),
    ...districts.map((d) => districtItem(d, state, onBallot.has(d.kind))),
  ];
  if (!items.length) return null;

  return (
    <div className="mt-2 font-mono-cap text-[12px] text-[var(--color-paper-3)] tracking-[0.16em] flex flex-wrap items-center gap-x-2 gap-y-1">
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden>·</span>}
          <span
            tabIndex={0}
            aria-describedby={`district-tip-${i}`}
            className="relative group/tip cursor-help border-b border-dotted border-[var(--color-paper-4)] hover:text-[var(--color-paper)] focus:text-[var(--color-paper)] focus:outline-none"
          >
            {it.label}
            <span
              id={`district-tip-${i}`}
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full mt-2 z-50 w-[300px] opacity-0 group-hover/tip:opacity-100 group-focus/tip:opacity-100 transition-opacity duration-150 rounded-lg bg-[var(--color-ink-0)] border border-[var(--color-ink-3)] shadow-xl p-3 text-left font-sans normal-case tracking-normal text-[12px] leading-[1.5] text-[var(--color-paper-2)]"
            >
              <span className="block mb-1 text-[var(--color-paper)] font-medium">{it.title}</span>
              {it.body}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
