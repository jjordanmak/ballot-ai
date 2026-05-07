import { redirect } from "next/navigation";
import { resolveZip } from "@/lib/db/resolveZip";
import { listElections } from "@/lib/db/getElection";
import { LandingForm } from "@/components/LandingForm";

export const dynamic = "force-dynamic";

/**
 * Landing page. Asks the user for a ZIP and an election, then routes
 * them to the per-ballot view at /ballot/[zip]/[electionId].
 *
 * The form submission runs as a Server Action, so the ZIP is validated
 * + resolved on the server before the redirect — no client-side network
 * round-trip beyond the form post.
 */
export default async function HomePage() {
  const elections = await listElections();
  // Default to the upcoming election (most recent future date), else the
  // most recent one regardless of date.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = elections.find((e) => e.date >= today);
  const defaultElectionId = upcoming?.id ?? elections[0]?.id ?? "";

  /** Server action: resolves ZIP + redirects to the ballot page. */
  async function submit(formData: FormData) {
    "use server";
    const zip = String(formData.get("zip") ?? "").trim();
    const electionId = String(formData.get("electionId") ?? "").trim();

    if (!/^\d{5}$/.test(zip)) {
      // Surfaces in the LandingForm via search params on redirect.
      redirect(`/?error=invalid_zip`);
    }

    const jurisdiction = await resolveZip(zip);
    if (!jurisdiction) {
      redirect(`/?error=unknown_zip&zip=${zip}`);
    }
    redirect(`/ballot/${zip}/${electionId}`);
  }

  return <LandingForm elections={elections} defaultElectionId={defaultElectionId} action={submit} />;
}
