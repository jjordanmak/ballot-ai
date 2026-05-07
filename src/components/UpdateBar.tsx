"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Check } from "lucide-react";

/**
 * Live-updated timestamp + refresh control. The pair lives together in one
 * client component so they can share `lastUpdate` state.
 *
 * v1: timestamp = page mount time, refresh button simulates a 1.5s fetch
 *     and bumps the timestamp to "now" on success. The eventual real-time
 *     impl will hit /api/refresh-ballot, which queries our race-data CDN
 *     for new entries (news, polls, endorsements, debate moments) since
 *     last-fetch and revalidates the page.
 */
export function UpdateBar() {
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [state, setState] = useState<"idle" | "fetching" | "done">("idle");

  // Mount time initializes both timestamps. `now` ticks every second so the
  // "Last updated" line shows down-to-the-second precision.
  useEffect(() => {
    const t = new Date();
    setLastUpdate(t);
    setNow(t);
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = async () => {
    if (state !== "idle") return;
    setState("fetching");
    // TODO(v2): replace with real fetch to /api/refresh-ballot
    await new Promise((r) => setTimeout(r, 1500));
    setLastUpdate(new Date());
    setState("done");
    // Stay in the "Up to date" state for 5 seconds after a successful update.
    setTimeout(() => setState("idle"), 5000);
  };

  const formatted = formatLastUpdate(lastUpdate, now);

  return (
    <div className="flex items-end gap-3">
      <div>
        <div className="font-mono-cap text-[var(--color-paper-4)] text-[9px] tracking-[0.18em]">
          Last updated
        </div>
        <div className="text-[var(--color-paper)] text-[14px] mt-1 font-mono race-number tabular-nums whitespace-nowrap">
          {formatted}
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={state !== "idle"}
        className={`group inline-flex items-center gap-1.5 rounded-full border transition-all px-2 py-0.5 mb-[1px] ${
          state === "done"
            ? "border-[var(--color-tint-green)] text-[var(--color-tint-green)] bg-[var(--color-tint-green-soft)]"
            : state === "fetching"
            ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-ink-2)] cursor-wait"
            : "border-[var(--color-ink-3)] text-[var(--color-paper-2)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:bg-[var(--color-ink-2)]"
        }`}
        aria-label="Update voter guide data"
        title="Pull the latest news, polls, and endorsements"
      >
        {state === "done" ? (
          <Check size={10} />
        ) : (
          <RefreshCw
            size={10}
            className={
              state === "fetching"
                ? "animate-spin"
                : "group-hover:rotate-180 transition-transform duration-700"
            }
          />
        )}
        <span className="font-mono-cap text-[9px] tracking-[0.18em]">
          {state === "done" ? "Up to date" : state === "fetching" ? "Updating" : "Update"}
        </span>
      </button>
    </div>
  );
}

function formatLastUpdate(lastUpdate: Date | null, now: Date | null) {
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
  // Always render an "ago" suffix — starts at "0s ago" the moment data
  // loads and ticks up from there.
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
