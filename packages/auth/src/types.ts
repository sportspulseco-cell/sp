// Authenticated principal extracted from a Supabase JWT.
export interface AuthPrincipal {
  readonly userId: string; // auth.users.id
  readonly email?: string;
  readonly role: "authenticated" | "anon" | "service_role";
  readonly aud: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly raw: Record<string, unknown>;
}
