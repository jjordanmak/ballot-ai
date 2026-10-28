/**
 * Markdown/JSON report helpers for QA + validation scripts.
 * Inputs are address-free domain objects only.
 */
import type { BallotWarning, Contest, ResolvedBallot } from "../../src/domain/ballot";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "../../src/domain/ballot";
import { summarize } from "../../src/lib/ballot/validate";

export function ballotMarkdown(title: string, b: ResolvedBallot, extra: string[] = []): string {
  const lines: string[] = [];
  lines.push(`# ${title}`, "");
  lines.push(`- **Election:** ${b.election?.name ?? "?"} (${b.election?.date ?? "?"}), provider id \`${b.election?.externalIds["google-civic"] ?? "?"}\``);
  lines.push(`- **Status:** ${b.status}`);
  lines.push(`- **Provider:** ${b.provider}, retrieved ${b.retrievedAt}`);
  lines.push(`- **Location (coarse):** ${[b.location.city, b.location.county, b.location.state].filter(Boolean).join(", ") || "—"}`);
  lines.push(`- **Contests:** ${b.contests.filter((c) => c.kind === "candidate").length} candidate · ${b.contests.filter((c) => c.kind === "measure").length} measure`);
  lines.push(`- **Election administration:** ${b.administration?.name ?? "—"} ${b.administration?.ballotInfoUrl ?? b.administration?.electionInfoUrl ?? ""}`);
  lines.push(...extra, "");

  for (const cat of CATEGORY_ORDER) {
    const cs = b.contests.filter((c) => c.category === cat);
    if (!cs.length) continue;
    lines.push(`## ${CATEGORY_LABEL[cat]}`, "");
    lines.push("| Contest | District | Vote for | Choices | Source(s) | Official verification |");
    lines.push("|---|---|---|---|---|---|");
    for (const c of cs) lines.push(contestRow(c));
    lines.push("");
  }

  lines.push("## Warnings", "");
  if (!b.warnings.length) lines.push("None.");
  else {
    lines.push("| Code | Severity | Contest | Detail |", "|---|---|---|---|");
    for (const w of b.warnings) lines.push(`| ${w.code} | ${w.severity} | ${contestTitle(b, w)} | ${esc(w.detail ?? "")} |`);
    lines.push("", "Counts: " + Object.entries(summarize(b.warnings)).map(([k, v]) => `${k}=${v}`).join(", "));
  }
  lines.push("");
  return lines.join("\n");
}

function contestRow(c: Contest): string {
  const choices =
    c.kind === "measure"
      ? `${c.measure?.identifier ? `**${esc(c.measure.identifier)}** ` : ""}${esc(c.measure?.title ?? "")}${c.measure?.passageThreshold ? ` (passes: ${esc(c.measure.passageThreshold)})` : ""}`
      : c.choices.map((x) => `${esc(x.ballotName)}${x.party ? ` (${esc(x.party)})` : ""}`).join("<br>") || "_none returned_";
  const src = c.sources.map((s) => `${esc(s.name)}${s.official ? " ✔︎official" : ""}`).join("; ");
  const vf = c.contestType === "retention" ? "Yes/No" : c.voteFor ?? "—";
  const ver = c.verification ? `${c.verification.status}${c.verification.note ? `: ${esc(c.verification.note)}` : ""}` : "**unverified**";
  return `| ${esc(c.title)} | ${esc(c.division.name)} | ${vf} | ${choices} | ${src} | ${ver} |`;
}

function contestTitle(b: ResolvedBallot, w: BallotWarning) {
  return w.contestId ? esc(b.contests.find((c) => c.id === w.contestId)?.title ?? w.contestId) : "—";
}

function esc(s: string) {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
