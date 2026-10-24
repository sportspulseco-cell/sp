/**
 * Loading a record for a page without turning every failure into a
 * 404. `load()` keeps the HTTP status of a failed call so the page can
 * tell "this does not exist" (404 → `notFound()`) apart from "the API
 * refused or fell over" (403 / 5xx / network → render `<LoadError>`).
 *
 * PPHL, 24 Oct 2026: during an API outage every detail page said
 * "404 This page could not be found" because the loaders did
 * `.catch(() => null)` and then `if (!x) notFound()`.
 */
export type LoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; message: string };

export async function load<T>(promise: Promise<T>): Promise<LoadResult<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (e) {
    const err = e as Error & { status?: number };
    return {
      ok: false,
      status: typeof err?.status === "number" ? err.status : null,
      message: err?.message ?? "Request failed"
    };
  }
}

/** True when the failure means the record does not exist (or is hidden from this caller). */
export function isNotFound(r: LoadResult<unknown>): boolean {
  return !r.ok && r.status === 404;
}
