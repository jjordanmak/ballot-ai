"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUp, MapPin, Menu, X } from "lucide-react";

export interface NavGroup {
  id: string;
  label: string;
  count: number;
}

interface BallotNavProps {
  groups: NavGroup[];
  location: string;
  electionName: string;
  electionDate: string;
}

function useActiveGroup(groups: NavGroup[]) {
  const [active, setActive] = useState(groups[0]?.id ?? "");
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const visible = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        }
        const top = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) setActive(top[0].replace(/^group-/, ""));
      },
      { rootMargin: "-15% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    groups.forEach((g) => {
      const el = document.getElementById(`group-${g.id}`);
      if (el) obs.observe(el);
    });
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [groups]);
  return { active, scrolled };
}

function Brand({ size }: { size: number }) {
  return (
    <span className="font-display leading-none tracking-[-0.02em]" style={{ fontSize: size }}>
      ballot<span className="text-[var(--color-paper-3)]">.ai</span>
    </span>
  );
}

function GroupLinks({ groups, active, onNavigate }: { groups: NavGroup[]; active: string; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {groups.map((g) => (
        <li key={g.id}>
          <a
            href={`#group-${g.id}`}
            onClick={onNavigate}
            aria-current={active === g.id ? "location" : undefined}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-[14px] transition-colors ${
              active === g.id
                ? "bg-[var(--color-ink-2)] text-[var(--color-paper)]"
                : "text-[var(--color-paper-2)] hover:bg-[var(--color-ink-1)] hover:text-[var(--color-paper)]"
            }`}
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={`w-1 h-4 rounded-full ${active === g.id ? "bg-[var(--color-accent)]" : "bg-transparent"}`}
              />
              {g.label}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--color-paper-4)]">{g.count}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function QuickActions({ scrolled }: { scrolled: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        disabled={!scrolled}
        aria-label="Back to top"
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-all font-mono-cap text-[9px] tracking-[0.18em] ${
          scrolled
            ? "border-[var(--color-ink-3)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-[var(--color-paper-3)]"
            : "border-[var(--color-ink-3)] text-[var(--color-paper-4)] cursor-default"
        }`}
      >
        <ArrowUp size={10} aria-hidden /> Top
      </button>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ink-3)] px-2.5 py-1 font-mono-cap text-[9px] tracking-[0.18em] text-[var(--color-paper-3)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all"
      >
        <MapPin size={10} aria-hidden /> Change
      </Link>
    </div>
  );
}

/** Desktop sidebar + mobile top bar/drawer for the address-resolved ballot. */
export function BallotNav({ groups, location, electionName, electionDate }: BallotNavProps) {
  const { active, scrolled } = useActiveGroup(groups);
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label="Ballot sections" className="sticky top-0 z-50 h-14 flex items-center justify-between px-5 border-b border-[var(--color-ink-3)] bg-[var(--color-ink-0)] lg:hidden">
        <Brand size={22} />
        <span className="flex-1 mx-4 font-mono-cap text-[9px] text-[var(--color-paper-3)] tracking-[0.14em] truncate text-right">
          {location}
        </span>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--color-paper-2)] hover:text-[var(--color-paper)] hover:bg-[var(--color-ink-1)]"
        >
          <Menu size={18} />
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-[200] lg:hidden" role="dialog" aria-modal="true" aria-label="Ballot sections">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-0 h-full w-[85%] max-w-[340px] bg-[var(--color-ink-0)] border-l border-[var(--color-ink-3)] p-5 overflow-y-auto">
            <div className="flex items-center justify-between">
              <Brand size={22} />
              <button onClick={() => setOpen(false)} aria-label="Close navigation" className="w-8 h-8 flex items-center justify-center text-[var(--color-paper-2)]">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 font-mono-cap text-[10px] text-[var(--color-accent)] tracking-[0.16em]">{location}</div>
            <div className="mt-1 font-mono-cap text-[10px] text-[var(--color-paper-3)] tracking-[0.14em]">
              {electionName} · {electionDate}
            </div>
            <div className="mt-4">
              <QuickActions scrolled={scrolled} />
            </div>
            <div className="mt-6">
              <GroupLinks groups={groups} active={active} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <aside className="hidden lg:flex sticky top-0 left-0 h-screen w-[300px] xl:w-[340px] flex-col border-r border-[var(--color-ink-3)] bg-[var(--color-ink-0)]">
        <div className="p-6 pb-5 border-b border-[var(--color-ink-3)]">
          <Brand size={28} />
          <div className="font-mono-cap text-[10px] text-[var(--color-accent)] mt-3 tracking-[0.16em]">{location}</div>
          <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mt-1.5 leading-relaxed tracking-[0.14em]">
            {electionName}
            <br />
            <span style={{ color: "color-mix(in oklch, var(--color-paper-3) 60%, var(--color-paper-4))" }}>{electionDate}</span>
          </div>
          <div className="mt-4">
            <QuickActions scrolled={scrolled} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <GroupLinks groups={groups} active={active} />
        </div>
      </aside>
    </>
  );
}
