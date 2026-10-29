"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, ExternalLink, MapPin, ShieldCheck } from "lucide-react";
import { resolveAddressAction, type AddressFormState } from "@/app/actions";
import { NO_STREET_NUMBER_COPY, STATUS_COPY } from "@/lib/ballot/copy";
import { readyToSuggest } from "@/lib/providers/google-places/ready";

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
 */
export function AddressForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [state, formAction, pending] = useActionState<AddressFormState, FormData>(resolveAddressAction, {});
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [filling, setFilling] = useState(false);
  const session = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inflight = useRef<AbortController | null>(null);
  // No ballot and no house number: likely registered by cross streets or a description.
  const handoff = !!state.noStreetNumber && (state.status === "NO_COVERAGE" || state.status === "INVALID_ADDRESS");
  const error = state.status ? (handoff ? NO_STREET_NUMBER_COPY : STATUS_COPY[state.status]) : null;
  const showLookup = !!state.lookup && (handoff || state.status === "NO_COVERAGE");

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

      <p id="address-hint" className="-mt-1 text-[12px] leading-[1.5] text-[var(--color-paper-3)]">
        Your home street address. No apartment or unit number needed: everyone at the same address has the same ballot.
      </p>

      <div aria-live="polite" id="address-error">
        {error && (
          <div className="rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] px-4 py-3">
            <p className="text-[14px] text-[var(--color-paper)] font-medium">{error.title}</p>
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
        disabled={pending || filling || address.trim().length < 5}
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
