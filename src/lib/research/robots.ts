/**
 * robots.txt, as sites publish it for automated readers. The research job
 * reads a page only when the site's rules allow it for "*" or for our
 * agent ("ballot.ai"). Longest matching rule wins; Allow wins ties.
 */

interface Rule {
  allow: boolean;
  pattern: string;
}

export const AGENT_TOKEN = "ballot.ai";

function groupsFor(txt: string, agent: string): Rule[] {
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const line of lines) {
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value || key === "allow") current.rules.push({ allow: key === "allow", pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  return (mine.length ? mine : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
}

function matches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern).split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

/** Whether `url` may be fetched under `robotsTxt` (an empty or missing file allows everything). */
export function robotsAllows(robotsTxt: string | null | undefined, url: string, agent = AGENT_TOKEN): boolean {
  if (!robotsTxt) return true;
  const u = new URL(url);
  const path = decodeURIComponent(u.pathname) + u.search;
  let best: Rule | null = null;
  for (const r of groupsFor(robotsTxt, agent)) {
    if (!matches(r.pattern, path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return !best || best.allow;
}
