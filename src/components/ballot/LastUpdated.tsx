"use client";

import { useEffect, useState } from "react";
import { useLatestUpdate } from "./LiveFeed";

/**
 * "Last updated": when something new last appeared on this ballot. Live; no
 * refresh button, since new items stream in by themselves. Falls back to
 * when the ballot data was retrieved until the first item arrives.
 */
export function LastUpdated({ fallback }: { fallback: string }) {
  const latest = useLatestUpdate();
  // Client clock only, so the server render can't disagree with the viewer's time zone.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const when = latest ?? new Date(fallback);
  return (
    <div>
      <div className="font-mono-cap text-[var(--color-paper-4)] text-[9px] tracking-[0.18em]">Last updated</div>
      <div className="text-[var(--color-paper)] text-[14px] mt-1 font-mono race-number tabular-nums whitespace-nowrap">
        {now ? formatLastUpdate(when, now) : "—"}
      </div>
    </div>
  );
}

/** "Oct 29, 2026 · 4:25:12 AM · 1s ago" */
export function formatLastUpdate(lastUpdate: Date | null, now: Date | null) {
  if (!lastUpdate) return "—";
  const time = lastUpdate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const date = lastUpdate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const diffSec = now
    ? Math.max(0, Math.floor((now.getTime() - lastUpdate.getTime()) / 1000))
    : 0;
  const ago =
    diffSec < 60
      ? `${diffSec}s ago`
      : diffSec < 3600
      ? `${Math.floor(diffSec / 60)}m ago`
      : `${Math.floor(diffSec / 3600)}h ago`;
  return `${date} · ${time} · ${ago}`;
}
