"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

/**
 * Live-updated timestamp + refresh control.
 *
 * Behavior:
 *  - Timestamp ticks every second, always shows "ago" suffix from 0s.
 *  - The button is DISABLED ("Up to date") until a Realtime subscription
 *    detects a change in the underlying content tables (candidates,
 *    races, endorsements, polls). News updates push to the carousel
 *    independently and don't enable the button — they're already live.
 *  - When a change arrives the button switches to "Update available";
 *    clicking it calls router.refresh() which busts the page's RSC cache
 *    and re-fetches from the DB.
 *  - 60s rate-limit cooldown after a click (prevents button-mashing
 *    even though clicks are cheap — 1 cache miss + 1 DB read each).
 */
export function UpdateBar() {
  const router = useRouter();
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [hasUpdates, setHasUpdates] = useState(false);
  const [state, setState] = useState<"idle" | "fetching" | "done">("idle");
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);

  // Mount time initializes both timestamps. `now` ticks every second so
  // the "Last updated" line shows down-to-the-second precision.
  useEffect(() => {
    const t = new Date();
    setLastUpdate(t);
    setNow(t);
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to Realtime changes on the content tables. Any insert /
  // update / delete on candidates / races / endorsements / polls flips
  // hasUpdates to true. We deliberately skip news_items — that table
  // updates the news carousel directly via its own subscription.
  useEffect(() => {
    const sb = getSupabaseBrowser();
    const channel = sb
      .channel("ballot-content-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "candidates" }, () => setHasUpdates(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "races" }, () => setHasUpdates(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "endorsements" }, () => setHasUpdates(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "polls" }, () => setHasUpdates(true))
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  const inCooldown = now != null && now.getTime() < cooldownUntil;

  const onRefresh = async () => {
    if (state !== "idle" || !hasUpdates || inCooldown) return;
    setState("fetching");
    // router.refresh() busts the React Server Component cache for the
    // current page; the next request hits the DB for fresh data.
    router.refresh();
    // Brief delay so the spinner has time to be visible.
    await new Promise((r) => setTimeout(r, 800));
    setLastUpdate(new Date());
    setHasUpdates(false);
    setState("done");
    setCooldownUntil(Date.now() + 60_000); // 60s rate limit
    setTimeout(() => setState("idle"), 5000);
  };

  const formatted = formatLastUpdate(lastUpdate, now);

  // ── UI states ──
  // idle + !hasUpdates  → disabled "Up to date" (default)
  // idle +  hasUpdates  → enabled "Update available"
  // fetching             → spinner "Updating"
  // done                 → "Up to date" for 5s
  const disabled =
    state === "fetching" || state === "done" || (!hasUpdates && state === "idle") || inCooldown;
  const label =
    state === "fetching"
      ? "Updating"
      : state === "done"
      ? "Up to date"
      : hasUpdates
      ? "Update available"
      : "Up to date";

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
        disabled={disabled}
        className={`group inline-flex items-center gap-1.5 rounded-full border transition-all px-2 py-0.5 mb-[1px] ${
          state === "fetching"
            ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-ink-2)] cursor-wait"
            : hasUpdates && state === "idle" && !inCooldown
            ? "border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-mute)]"
            : // Disabled states share an appearance — muted gray, not interactive
              "border-[var(--color-ink-3)] text-[var(--color-paper-4)] cursor-default"
        }`}
        aria-label={label}
        title={
          hasUpdates && !inCooldown
            ? "New content is available — click to refresh"
            : "No updates since last refresh"
        }
      >
        {state === "done" || (!hasUpdates && state === "idle") ? (
          <Check size={10} />
        ) : (
          <RefreshCw
            size={10}
            className={state === "fetching" ? "animate-spin" : ""}
          />
        )}
        <span className="font-mono-cap text-[9px] tracking-[0.18em]">{label}</span>
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
