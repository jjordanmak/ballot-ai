import type { SourceRef } from "@/domain/ballot";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });
}

const link = "underline decoration-[var(--color-ink-4)] hover:text-[var(--color-accent)]";

/**
 * Where a contest's ballot data came from and when: official sources are
 * labeled as such; the aggregator is shown as the conduit, never as the
 * authority. Rendered inside the Sources block.
 */
export function ProvenanceLine({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return null;
  const official = sources.filter((s) => s.official);
  const conduit = sources.filter((s) => !s.official);
  const name = (s: SourceRef) =>
    s.url ? (
      <a href={s.url} className={link} rel="noopener noreferrer" target="_blank">
        {s.name}
      </a>
    ) : (
      s.name
    );
  return (
    <>
      {official.map((s, i) => (
        <span key={s.name}>
          {i > 0 && ", "}
          {name(s)} <span className="text-[var(--color-paper-3)]">(official)</span>
        </span>
      ))}
      {official.length > 0 && conduit.length > 0 && " · via "}
      {conduit.map((s, i) => (
        <span key={s.name}>
          {i > 0 && ", "}
          {name(s)}
        </span>
      ))}
      {" · retrieved "}
      {fmt(sources[0].retrievedAt)}
    </>
  );
}
