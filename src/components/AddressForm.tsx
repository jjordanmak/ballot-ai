"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ExternalLink, MapPin, ShieldCheck, TriangleAlert } from "lucide-react";
import { resolveAddressAction, type AddressFormState } from "@/app/actions";
import { INCOMPLETE_ADDRESS_COPY, NO_STREET_NUMBER_COPY, STATUS_COPY } from "@/lib/ballot/copy";
import { hasLocality } from "@/lib/providers/address";
import { readyToSuggest } from "@/lib/providers/google-places/ready";
import type { ElectionChoice } from "@/lib/ballot/electionChoices";

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

const DEBOUNCE_MS = 300;

/**
 * Single-field residential address form. No ZIP step: ZIP alone can't
 * determine a ballot. As the visitor types, matching street addresses are
 * suggested (Google Places via our server); picking one fills in the full
 * address with ZIP. Typing the whole address by hand always works too.
 *
 * Once the address is complete, the election picker appears with the next
 * election already selected; the button waits for both. (Only upcoming
 * elections are offered; past ones will live in a future archive.)
 */
export function AddressForm({ autoFocus = false, elections = [] }: { autoFocus?: boolean; elections?: ElectionChoice[] }) {
  const [state, formAction, pending] = useActionState<AddressFormState, FormData>(resolveAddressAction, {});
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [filling, setFilling] = useState(false);
  const [electionSlug, setElectionSlug] = useState(elections[0]?.slug ?? "");
  const session = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inflight = useRef<AbortController | null>(null);
  // No ballot and no house number: likely registered by cross streets or a description.
  const handoff = !!state.noStreetNumber && (state.status === "NO_COVERAGE" || state.status === "INVALID_ADDRESS");
  const error = state.status
    ? handoff
      ? NO_STREET_NUMBER_COPY
      : state.incomplete
        ? INCOMPLETE_ADDRESS_COPY
        : STATUS_COPY[state.status]
    : null;
  // The button waits for a full address (ZIP, or city and state); the hint says what's missing.
  const complete = hasLocality(address);
  // Only once a street is under way ("123 Mai"), so the hint doesn't nag on the first keystrokes.
  const missingLocality = !complete && readyToSuggest(address);
  const showLookup = !!state.lookup && (handoff || state.status === "NO_COVERAGE");
  // No list (couldn't be read): the server picks the next election itself.
  const electionReady = elections.length === 0 || !!electionSlug;

  useEffect(() => () => {
    clearTimeout(timer.current);
    inflight.current?.abort();
  }, []);

  function onType(value: string) {
    setAddress(value);
    setActive(-1);
    clearTimeout(timer.current);
    inflight.current?.abort();
    if (!readyToSuggest(value)) {
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      session.current ??= crypto.randomUUID();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      try {
        const res = await fetch("/api/address/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: value, sessionToken: session.current }),
          signal: ctrl.signal,
        });
        const list = ((await res.json()) as { suggestions?: Suggestion[] }).suggestions ?? [];
        setSuggestions(list);
        setOpen(list.length > 0);
      } catch {
        // Aborted or offline: keep typing manually.
      }
    }, DEBOUNCE_MS);
  }

  async function pick(s: Suggestion) {
    clearTimeout(timer.current);
    inflight.current?.abort();
    setOpen(false);
    setActive(-1);
    setAddress(s.secondary ? `${s.main}, ${s.secondary}` : s.main);
    const token = session.current;
    session.current = null;
    if (!token) return;
    setFilling(true);
    try {
      const res = await fetch("/api/address/place", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placeId: s.placeId, sessionToken: token }),
      });
      const full = ((await res.json()) as { address?: string }).address;
      if (full) setAddress(full);
    } catch {
      // Keep the suggestion text; it still resolves.
    } finally {
      setFilling(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // Cycles through the options and back to the typed text (-1).
      const last = suggestions.length - 1;
      setActive((i) => (e.key === "ArrowDown" ? (i >= last ? -1 : i + 1) : i <= -1 ? last : i - 1));
    } else if (e.key === "Enter" && active >= 0 && active < suggestions.length) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <form action={formAction} className="w-full max-w-xl flex flex-col gap-3" noValidate>
      <label htmlFor="address" className="font-mono-cap text-[10px] text-[var(--color-paper-3)] tracking-[0.18em]">
        What{"’"}s your home address?
      </label>
      <div className="relative">
        <MapPin
          size={14}
          aria-hidden
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-paper-3)] pointer-events-none"
        />
        <input
          id="address"
          name="address"
          type="text"
          inputMode="text"
          // Our own suggestion list replaces the browser's autofill dropdown.
          autoComplete="off"
          autoFocus={autoFocus}
          required
          minLength={5}
          placeholder="Start typing your street address"
          value={address}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="address-suggestions"
          aria-activedescendant={open && active >= 0 && active < suggestions.length ? `address-option-${active}` : undefined}
          aria-invalid={!!error}
          aria-describedby={error ? "address-hint address-error" : "address-hint address-privacy"}
          className="w-full bg-[var(--color-ink-1)] border border-[var(--color-ink-3)] rounded-lg pl-10 pr-4 py-3.5 text-[16px] text-[var(--color-paper)] placeholder:text-[var(--color-paper-4)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        />
        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] shadow-lg overflow-hidden">
            <ul id="address-suggestions" role="listbox" aria-label="Suggested addresses">
              {suggestions.map((s, i) => (
                <li
                  key={s.placeId}
                  id={`address-option-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown (not click) so the pick lands before the input blurs.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-start gap-2.5 px-4 py-2.5 cursor-pointer transition-colors ${
                    i === active ? "bg-[var(--color-ink-3)]" : ""
                  }`}
                >
                  <MapPin
                    size={12}
                    aria-hidden
                    className={`mt-[4px] shrink-0 ${i === active ? "text-[var(--color-accent)]" : "text-[var(--color-paper-4)]"}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[14px] text-[var(--color-paper)] truncate">{s.main}</span>
                    {s.secondary && <span className="block text-[12px] text-[var(--color-paper-3)] truncate">{s.secondary}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-4 py-1.5 border-t border-[var(--color-ink-3)] font-mono-cap text-[8px] tracking-[0.18em] text-[var(--color-paper-4)]">
              Suggestions from Google Maps
            </div>
          </div>
        )}
      </div>

      <p
        id="address-hint"
        aria-live="polite"
        className={`-mt-1 text-[12px] leading-[1.5] ${missingLocality ? "text-[var(--color-paper)]" : "text-[var(--color-paper-3)]"}`}
      >
        {missingLocality
          ? "Add the city and state, or the ZIP code (for example: 123 Main St, Springfield, IL 62701), or pick your address from the suggestions."
          : "Your home street address. No apartment or unit number needed: everyone at the same address has the same ballot."}
      </p>

      {complete && elections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="electionSlug" className="font-mono-cap text-[10px] text-[var(--color-paper-3)] tracking-[0.18em]">
            Election
          </label>
          <div className="relative">
            <select
              id="electionSlug"
              name="electionSlug"
              value={electionSlug}
              onChange={(e) => setElectionSlug(e.target.value)}
              className="w-full appearance-none bg-[var(--color-ink-1)] border border-[var(--color-ink-3)] rounded-lg pl-4 pr-10 py-3 text-[15px] text-[var(--color-paper)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            >
              {elections.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--color-paper-3)] pointer-events-none" />
          </div>
        </div>
      )}

      <div aria-live="polite" id="address-error">
        {error && (
          <div className="rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] px-4 py-3">
            <p className="flex items-center gap-2 text-[14px] text-[var(--color-paper)] font-medium">
              <TriangleAlert size={14} aria-hidden className="shrink-0 text-[var(--color-accent)]" />
              {error.title}
            </p>
            <p className="mt-1 text-[13px] leading-[1.55] text-[var(--color-paper-2)]">{error.body}</p>
            {showLookup && (
              <a
                href={state.lookup!.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[13px] text-[var(--color-paper)] underline hover:text-[var(--color-accent)]"
              >
                {state.lookup!.label} <ExternalLink size={12} aria-hidden />
              </a>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || filling || !complete || !electionReady}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-[var(--color-ink-0)] font-medium px-5 py-3 text-[14px] transition-all"
      >
        {pending ? "Finding your ballot…" : "View my ballot"}
        {!pending && <ArrowRight size={14} aria-hidden />}
      </button>

      <p id="address-privacy" className="mt-1 flex items-start gap-2 text-[12px] leading-[1.5] text-[var(--color-paper-3)]">
        <ShieldCheck size={13} aria-hidden className="mt-[2px] shrink-0 text-[var(--color-accent)]" />
        We send your address to Google to suggest matches and look up your ballot, then discard it. It isn{"’"}t saved,
        logged, or shared with AI tools.
      </p>
    </form>
  );
}
