"use server";

import { redirect } from "next/navigation";
import type { ResolutionStatus } from "@/domain/ballot";
import { STATE_LOOKUP_FALLBACK } from "@/lib/ballot/copy";
import { resolveBallotForAddress } from "@/lib/ballot/resolveBallot";

export interface AddressFormState {
  status?: Exclude<ResolutionStatus, "SUCCESS" | "PARTIAL">;
  /** Typed without a ZIP or a city and state; ask for the full address. */
  incomplete?: boolean;
  /** The input had no house number (cross streets, a description, a city): show the voter-lookup handoff. */
  noStreetNumber?: boolean;
  /** Official state voter lookup to hand off to. State-level link, never address-derived detail. */
  lookup?: { label: string; url: string };
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
  const outcome = await resolveBallotForAddress(raw);
  if (outcome.ok) redirect(`/ballot/${outcome.electionSlug}/${outcome.ballotKey}`);
  const admin = outcome.administration;
  return {
    status: outcome.status as AddressFormState["status"],
    incomplete: outcome.incomplete,
    noStreetNumber: typeof raw === "string" && !/^\s*\d/.test(raw),
    lookup: admin?.voterLookupUrl
      ? { label: admin.regionName ? `${admin.regionName} voter lookup` : "Your state's voter lookup", url: admin.voterLookupUrl }
      : STATE_LOOKUP_FALLBACK,
  };
}
