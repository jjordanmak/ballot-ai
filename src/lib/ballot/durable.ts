/**
 * Durable November records: every resolved contest and candidate gets a
 * stable row in `contests` / `contest_candidates` (migration 0004), and the
 * ballot carries those ids so live feed items and official links can attach
 * to them. Address-free: only official contest and candidate data is written.
 */
import "server-only";
import type { Contest, ResolvedBallot } from "@/domain/ballot";
import type { EnrichmentBundle } from "@/domain/enrichment";
import { normalizeForMatch } from "@/domain/text";
import { logEvent } from "@/lib/observability/log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { displayName } from "./toRaces";

export interface DurableRegistry {
  /** Upserts the ballot's contests and candidates and sets their `durableId`s. Never throws. */
  register(ballot: ResolvedBallot, bundle: EnrichmentBundle): Promise<void>;
}

/** Fixture / local memory mode: nothing durable to attach to. */
export class NoDurableRegistry implements DurableRegistry {
  async register(): Promise<void> {}
}

/**
 * Unique title within (election, division). Two retention contests can share
 * an office title, so the justice's ballot name is part of theirs.
 */
export function durableTitle(c: Contest): string {
  const t = c.contestType === "retention" && c.choices.length === 1 ? `${c.title} ${c.choices[0].ballotName}` : c.title;
  return normalizeForMatch(t);
}

/**
 * Durable titles for a whole ballot. When two contests still share a
 * division and title (e.g. one retention question per justice that the
 * provider types "General"), their candidates' names tell them apart, so a
 * single upsert batch never hits the same key twice.
 */
export function durableTitles(contests: Contest[]): Map<Contest, string> {
  const base = new Map(contests.map((c) => [c, durableTitle(c)]));
  const count = new Map<string, number>();
  for (const c of contests) count.set(`${c.division.key}|${base.get(c)}`, (count.get(`${c.division.key}|${base.get(c)}`) ?? 0) + 1);
  for (const c of contests) {
    if ((count.get(`${c.division.key}|${base.get(c)}`) ?? 0) < 2) continue;
    const names = c.choices.map((ch) => ch.ballotName).sort().join(" ");
    base.set(c, normalizeForMatch(`${c.title} ${names}`));
  }
  return base;
}

/** The state a division belongs to: from its key, else the ballot's state; none for national divisions. */
export function divisionState(key: string, ballotState: string | undefined): string | null {
  if (key.startsWith("ocd-division/")) {
    const st = /\/state:([a-z]{2})/.exec(key);
    if (st) return st[1].toUpperCase();
    return /\/district:dc/.test(key) ? "DC" : null; // country-level divisions belong to no state
  }
  const prefix = /^([a-z]{2}):/.exec(key);
  return prefix ? prefix[1].toUpperCase() : (ballotState ?? null);
}

function uniqueBy<T>(rows: T[], key: (r: T) => string): T[] {
  return [...new Map(rows.map((r) => [key(r), r])).values()];
}

/**
 * Insert-if-missing, then read the ids back. Contest and candidate rows are
 * shared by every voter in a district; rewriting them on every lookup would
 * lock the same statewide rows under load.
 */
export class SupabaseDurableRegistry implements DurableRegistry {
  async register(ballot: ResolvedBallot, bundle: EnrichmentBundle): Promise<void> {
    const electionId = ballot.election?.id;
    if (!electionId || !ballot.contests.length) return;
    const db = getSupabaseAdmin();
    const fail = (stage: string, e: unknown) =>
      // Live feeds are an enhancement; a voter's lookup must never fail on them.
      logEvent("durable.register_failed", { stage, error: e instanceof Error ? e.message : "unknown" });

    const divisions = uniqueBy(ballot.contests.map((c) => c.division), (d) => d.key);
    try {
      const rows = divisions.map((d) => ({
        key: d.key,
        name: d.name || d.key,
        ocd_id: d.ocdId ?? null,
        scope: d.scope ?? null,
        state: divisionState(d.key, ballot.location.state),
      }));
      const { error } = await db.from("divisions").upsert(rows, { onConflict: "key", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      // Rows first written without a state get one (news matching needs it).
      for (const r of rows.filter((r) => r.state)) {
        await db.from("divisions").update({ state: r.state }).eq("key", r.key).is("state", null);
      }
    } catch (e) {
      return fail("divisions", e);
    }

    const titles = durableTitles(ballot.contests);
    try {
      const rows = uniqueBy(
        ballot.contests.map((c) => ({
          election_id: electionId,
          division_key: c.division.key,
          kind: c.kind,
          contest_type: c.contestType,
          title: c.title,
          normalized_title: titles.get(c)!,
          ballot_title: c.ballotTitle ?? null,
          number_elected: c.numberElected ?? null,
          vote_for: c.voteFor ?? null,
          special: c.special,
        })),
        (r) => `${r.division_key}|${r.normalized_title}`,
      );
      const { error } = await db.from("contests").upsert(rows, { onConflict: "election_id,division_key,normalized_title", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      const { data, error: rErr } = await db
        .from("contests")
        .select("id, division_key, normalized_title")
        .eq("election_id", electionId)
        .in("division_key", divisions.map((d) => d.key))
        .in("normalized_title", rows.map((r) => r.normalized_title));
      if (rErr) throw new Error(rErr.message);
      const contestId = new Map((data ?? []).map((r) => [`${r.division_key}|${r.normalized_title}`, r.id]));
      for (const c of ballot.contests) c.durableId = contestId.get(`${c.division.key}|${titles.get(c)}`);
    } catch (e) {
      return fail("contests", e);
    }

    try {
      const rows = uniqueBy(
        ballot.contests.flatMap((c) =>
          c.durableId
            ? c.choices.map((ch) => ({
                contest_id: c.durableId!,
                ballot_name: ch.ballotName,
                normalized_name: normalizeForMatch(ch.ballotName),
                display_name: displayName(c, ch, bundle),
                party: ch.party ?? null,
                designation: ch.designation ?? null,
                incumbent: ch.incumbent ?? null,
                order_on_ballot: ch.orderOnBallot ?? null,
                campaign_url: ch.urls.campaign ?? null,
              }))
            : [],
        ),
        (r) => `${r.contest_id}|${r.normalized_name}`,
      );
      if (!rows.length) return;
      const { error } = await db.from("contest_candidates").upsert(rows, { onConflict: "contest_id,normalized_name", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      const { data, error: rErr } = await db
        .from("contest_candidates")
        .select("id, contest_id, normalized_name")
        .in("contest_id", [...new Set(rows.map((r) => r.contest_id))]);
      if (rErr) throw new Error(rErr.message);
      const candId = new Map((data ?? []).map((r) => [`${r.contest_id}|${r.normalized_name}`, r.id]));
      for (const c of ballot.contests) {
        for (const ch of c.choices) ch.durableId = c.durableId ? candId.get(`${c.durableId}|${normalizeForMatch(ch.ballotName)}`) : undefined;
      }
    } catch (e) {
      fail("contest_candidates", e);
    }
  }
}
