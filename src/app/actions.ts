"use server";

import { redirect } from "next/navigation";
import type { ResolutionStatus } from "@/domain/ballot";
import { officialLinks, STATE_LOOKUP_FALLBACK, type OfficialLink } from "@/lib/ballot/copy";
import { resolveBallotForAddress } from "@/lib/ballot/resolveBallot";
import { startsLikeStreetAddress } from "@/lib/providers/address";
import { logEvent } from "@/lib/observability/log";

export interface AddressFormState {
  status?: Exclude<ResolutionStatus, "SUCCESS" | "PARTIAL">;
  /** Typed without a ZIP or a city and state; ask for the full address. */
  incomplete?: boolean;
  /** The input had no house number (cross streets, a description, a city): show the voter-lookup handoff. */
  noStreetNumber?: boolean;
  /** Google placed the address but has no races for it yet (not the voter's fault). */
  notPublished?: boolean;
  /** Official election-office pages to hand off to. State or county offices, never address-derived detail. */
  links?: OfficialLink[];
}

/**
 * Address → ballot. The address arrives in the POST body, is used for one
 * provider lookup, and is dropped. Success redirects to an address-free URL;
 * failure returns a status so the form keeps what the voter typed.
 */
export async function resolveAddressAction(
  _prev: AddressFormState,
  formData: FormData,
): Promise<AddressFormState> {
  const raw = formData.get("address");
  const picked = formData.get("electionSlug");
  const electionSlug = typeof picked === "string" && /^[a-z0-9-]{1,64}$/.test(picked) ? picked : undefined;
  let outcome: Awaited<ReturnType<typeof resolveBallotForAddress>>;
  try {
    outcome = await resolveBallotForAddress(raw, undefined, electionSlug);
  } catch (e) {
    // Never a bare error page: the form shows the provider-error copy and the official lookup.
    logEvent("ballot.resolve_crashed", { error: e instanceof Error ? e.name : "unknown" });
    return { status: "PROVIDER_ERROR", links: [STATE_LOOKUP_FALLBACK] };
  }
  if (outcome.ok) redirect(`/ballot/${outcome.electionSlug}/${outcome.ballotKey}`);
  const admin = outcome.administration;
  return {
    status: outcome.status as AddressFormState["status"],
    incomplete: outcome.incomplete,
    noStreetNumber: typeof raw === "string" && !startsLikeStreetAddress(raw),
    notPublished: outcome.status === "NO_COVERAGE" && !!outcome.located,
    links: officialLinks(admin),
  };
}
