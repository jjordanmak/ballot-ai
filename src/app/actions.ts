"use server";

import { redirect } from "next/navigation";
import type { ResolutionStatus } from "@/domain/ballot";
import { resolveBallotForAddress } from "@/lib/ballot/resolveBallot";

export interface AddressFormState {
  status?: Exclude<ResolutionStatus, "SUCCESS" | "PARTIAL">;
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
  const outcome = await resolveBallotForAddress(formData.get("address"));
  if (outcome.ok) redirect(`/ballot/${outcome.electionSlug}/${outcome.ballotKey}`);
  return { status: outcome.status as AddressFormState["status"] };
}
