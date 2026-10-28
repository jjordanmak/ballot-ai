"use client";

import { useActionState, useState } from "react";
import { ArrowRight, MapPin, ShieldCheck } from "lucide-react";
import { resolveAddressAction, type AddressFormState } from "@/app/actions";
import { STATUS_COPY } from "@/lib/ballot/copy";

/**
 * Single-field residential address form. No ZIP step: ZIP alone can't
 * determine a ballot. Autocomplete (Places) is a later enhancement; manual
 * entry always works.
 */
export function AddressForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [state, formAction, pending] = useActionState<AddressFormState, FormData>(resolveAddressAction, {});
  const [address, setAddress] = useState("");
  const error = state.status ? STATUS_COPY[state.status] : null;

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
          autoComplete="street-address"
          autoFocus={autoFocus}
          required
          minLength={5}
          placeholder="Street address, city, state"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "address-error" : "address-privacy"}
          className="w-full bg-[var(--color-ink-1)] border border-[var(--color-ink-3)] rounded-lg pl-10 pr-4 py-3.5 text-[16px] text-[var(--color-paper)] placeholder:text-[var(--color-paper-4)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        />
      </div>

      <div aria-live="polite" id="address-error">
        {error && (
          <div className="rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] px-4 py-3">
            <p className="text-[14px] text-[var(--color-paper)] font-medium">{error.title}</p>
            <p className="mt-1 text-[13px] leading-[1.55] text-[var(--color-paper-2)]">{error.body}</p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || address.trim().length < 5}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-[var(--color-ink-0)] font-medium px-5 py-3 text-[14px] transition-all"
      >
        {pending ? "Finding your ballot…" : "View my ballot"}
        {!pending && <ArrowRight size={14} aria-hidden />}
      </button>

      <p id="address-privacy" className="mt-1 flex items-start gap-2 text-[12px] leading-[1.5] text-[var(--color-paper-3)]">
        <ShieldCheck size={13} aria-hidden className="mt-[2px] shrink-0 text-[var(--color-accent)]" />
        We use your address once to look up your ballot, then discard it. It isn{"’"}t saved, logged, or shared with AI tools.
      </p>
    </form>
  );
}
