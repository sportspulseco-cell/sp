/**
 * Stable SHA-256 of a JSON-serialisable value, returned hex.
 *
 * Used to compute schedule_runs.input_hash so that identical inputs
 * produce identical hashes — the determinism contract (locked
 * decision #4).
 *
 * Canonical serialisation: keys sorted recursively, then JSON-encoded.
 * Without sorting, {a:1,b:2} and {b:2,a:1} would hash differently.
 */
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = canonicalise((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export async function sha256Hex(value: unknown): Promise<string> {
  const canonical = JSON.stringify(canonicalise(value));
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
