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

/**
 * Provenance footer: every contest says where its data came from and when.
 * Official sources are labeled as such; the aggregator is shown as the
 * conduit, never as the authority.
 */
export function SourceLine({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return null;
  const official = sources.filter((s) => s.official);
  const conduit = sources.filter((s) => !s.official);
  const retrieved = sources[0].retrievedAt;
  return (
    <p className="mt-4 pt-3 border-t border-[var(--color-ink-3)] text-[11px] leading-[1.6] text-[var(--color-paper-4)]">
      <span className="font-mono-cap tracking-[0.14em] text-[9px] text-[var(--color-paper-3)]">Source</span>{" "}
      {official.length > 0 && (
        <>
          {official.map((s, i) => (
            <span key={s.name}>
              {i > 0 && ", "}
              {s.url ? (
                <a href={s.url} className="underline decoration-[var(--color-ink-4)] hover:text-[var(--color-accent)]" rel="noopener noreferrer" target="_blank">
                  {s.name}
                </a>
              ) : (
                s.name
              )}{" "}
              <span className="text-[var(--color-paper-3)]">(official)</span>
            </span>
          ))}
          {conduit.length > 0 && " · via "}
        </>
      )}
      {conduit.map((s, i) => (
        <span key={s.name}>
          {i > 0 && ", "}
          {s.url ? (
            <a href={s.url} className="underline decoration-[var(--color-ink-4)] hover:text-[var(--color-accent)]" rel="noopener noreferrer" target="_blank">
              {s.name}
            </a>
          ) : (
            s.name
          )}
        </span>
      ))}
      {" · retrieved "}
      {fmt(retrieved)}
    </p>
  );
}
