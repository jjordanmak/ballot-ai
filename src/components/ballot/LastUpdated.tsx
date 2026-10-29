"use client";

import { useEffect, useState } from "react";
import { formatLastUpdate } from "@/components/UpdateBar";
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
