/**
 * Application service: residential address → stored, address-free ballot.
 *
 * The address exists only inside this call (wrapped in AddressInput) and in
 * the outbound provider request. Nothing returned or persisted contains it.
 * See docs/architecture/PRIVACY.md.
 */
import "server-only";
import { hasBallot, type ElectionAdministration, type ResolutionStatus } from "@/domain/ballot";
import { AddressInput } from "@/lib/providers/address";
import { logEvent } from "@/lib/observability/log";
import { computeBallotKey } from "./ballotKey";
import { getEnrichment } from "./enrichment";
import { supplementWithOfficialRecords } from "./officialRecords";
import { getBallotRuntime, type BallotRuntime } from "./runtime";
import { validateBallot } from "./validate";
import { electionToday } from "@/domain/electionDay";

export type ResolveOutcome =
  | { ok: true; status: ResolutionStatus; electionSlug: string; ballotKey: string }
  | {
      ok: false;
      status: ResolutionStatus;
      administration?: ElectionAdministration;
      /** The provider placed the address (it knows the state) but returned no races: not published there yet. */
      located?: boolean;
      /** Typed without a ZIP or a city and state: the provider was not asked. */
      incomplete?: boolean;
    };

export async function resolveBallotForAddress(
  rawAddress: unknown,
  runtime: BallotRuntime = getBallotRuntime(),
  /** The election picked on the form; the next upcoming one when absent. */
  electionSlug?: string,
): Promise<ResolveOutcome> {
  const started = Date.now();
  const address = AddressInput.parse(rawAddress);
  if (!address) return { ok: false, status: "INVALID_ADDRESS" };
  // The provider guesses a location for partial addresses ("1 Main St" → Dallas); never risk the wrong ballot.
  if (!address.hasLocality()) return { ok: false, status: "INVALID_ADDRESS", incomplete: true };

  const lookup = electionSlug ? await runtime.elections.lookup(electionSlug) : await runtime.elections.current();
  if (!lookup.ok) {
    logEvent("ballot.election_unavailable", { status: lookup.status, detail: lookup.detail });
    await runtime.store.recordEvent({
      provider: runtime.mode,
      status: lookup.status,
      latencyMs: Date.now() - started,
      contestCount: 0,
      warningCodes: [],
    });
    return { ok: false, status: lookup.status };
  }
  const election = lookup.election;

  const ballot = await runtime.resolver.resolveBallot(address, election);
  if (hasBallot(ballot)) supplementWithOfficialRecords(ballot);
  const today = electionToday();
  if (hasBallot(ballot)) {
    const seen = new Set(ballot.warnings.map((w) => `${w.code}|${w.contestId ?? ""}`));
    for (const w of validateBallot(ballot, today)) {
      if (!seen.has(`${w.code}|${w.contestId ?? ""}`)) ballot.warnings.push(w);
    }
  }

  await runtime.store.recordEvent({
    electionId: election.id,
    provider: ballot.provider,
    status: ballot.status,
    latencyMs: Date.now() - started,
    contestCount: ballot.contests.length,
    state: ballot.location.state,
    warningCodes: [...new Set(ballot.warnings.map((w) => w.code))],
  });

  if (!hasBallot(ballot)) {
    if (ballot.statusDetail) logEvent("ballot.not_resolved", { status: ballot.status, detail: ballot.statusDetail });
    return { ok: false, status: ballot.status, administration: ballot.administration, located: !!ballot.location.state };
  }

  const ballotKey = computeBallotKey(election.id, ballot.districtDescriptors ?? ballot.contests.map((c) => c.division.key));
  ballot.ballotKey = ballotKey;
  await runtime.durable.register(ballot, getEnrichment(election.slug));
  try {
    await runtime.store.save(ballotKey, ballot);
  } catch (e) {
    // Can't keep the ballot for its page: report a provider-side failure, not a crash.
    logEvent("ballot.save_failed", { error: e instanceof Error ? e.message : "unknown" });
    return { ok: false, status: "PROVIDER_ERROR", administration: ballot.administration };
  }
  return { ok: true, status: ballot.status, electionSlug: election.slug, ballotKey };
}
