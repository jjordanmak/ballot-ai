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

export class SupabaseDurableRegistry implements DurableRegistry {
  async register(ballot: ResolvedBallot, bundle: EnrichmentBundle): Promise<void> {
    const electionId = ballot.election?.id;
    if (!electionId || !ballot.contests.length) return;
    try {
      const db = getSupabaseAdmin();
      const divisions = new Map(ballot.contests.map((c) => [c.division.key, c.division]));
      const { error: dErr } = await db.from("divisions").upsert(
        [...divisions.values()].map((d) => ({
          key: d.key,
          name: d.name || d.key,
          ocd_id: d.ocdId ?? null,
          scope: d.scope ?? null,
          state: ballot.location.state ?? null,
        })),
        { onConflict: "key", ignoreDuplicates: true },
      );
      if (dErr) throw new Error(`divisions: ${dErr.message}`);

      const { data: contests, error: cErr } = await db
        .from("contests")
        .upsert(
          ballot.contests.map((c) => ({
            election_id: electionId,
            division_key: c.division.key,
            kind: c.kind,
            contest_type: c.contestType,
            title: c.title,
            normalized_title: durableTitle(c),
            ballot_title: c.ballotTitle ?? null,
            number_elected: c.numberElected ?? null,
            vote_for: c.voteFor ?? null,
            special: c.special,
          })),
          { onConflict: "election_id,division_key,normalized_title" },
        )
        .select("id, division_key, normalized_title");
      if (cErr) throw new Error(`contests: ${cErr.message}`);
      const contestId = new Map((contests ?? []).map((r) => [`${r.division_key}|${r.normalized_title}`, r.id]));
      for (const c of ballot.contests) c.durableId = contestId.get(`${c.division.key}|${durableTitle(c)}`);

      const rows = ballot.contests.flatMap((c) =>
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
      );
      if (rows.length) {
        const { data: cands, error: kErr } = await db
          .from("contest_candidates")
          .upsert(rows, { onConflict: "contest_id,normalized_name" })
          .select("id, contest_id, normalized_name");
        if (kErr) throw new Error(`contest_candidates: ${kErr.message}`);
        const candId = new Map((cands ?? []).map((r) => [`${r.contest_id}|${r.normalized_name}`, r.id]));
        for (const c of ballot.contests) {
          for (const ch of c.choices) ch.durableId = candId.get(`${c.durableId}|${normalizeForMatch(ch.ballotName)}`);
        }
      }
    } catch (e) {
      // Live feeds are an enhancement; a voter's lookup must never fail on them.
      logEvent("durable.register_failed", { error: e instanceof Error ? e.message : "unknown" });
    }
  }
}
