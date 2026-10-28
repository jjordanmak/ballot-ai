/**
 * Deterministic short ids (FNV-1a, 52-bit). Stable across runs so fixtures,
 * caches, and durable-record matching agree. Not a security primitive.
 */
export function stableId(prefix: string, ...parts: (string | undefined)[]): string {
  const input = parts.map((p) => p ?? "").join("␟");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `${prefix}_${h1.toString(36)}${(h2 & 0xfffff).toString(36)}`;
}
