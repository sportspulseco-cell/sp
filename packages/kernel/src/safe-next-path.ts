/**
 * Where to go after signing in, from a `?next=` value. Only a path on the
 * same site is followed: "/x" yes; "https://other", "//other", "/\\other"
 * and anything else fall back. Without this a crafted sign-in link could
 * send a person to another site right after they signed in.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const v = raw.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(v)) return fallback;
  return v;
}
