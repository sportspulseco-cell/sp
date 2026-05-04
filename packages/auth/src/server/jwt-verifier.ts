import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthPrincipal } from "../types";

export interface JwtVerifierOptions {
  /** Preferred: Supabase JWKS endpoint (asymmetric ES256/RS256). */
  jwksUrl?: string;
  /** Fallback: HS256 shared secret (Project Settings → API → JWT Settings). */
  jwtSecret?: string;
  /** Expected audience. Default "authenticated". */
  audience?: string;
  /** Expected issuer, e.g. "https://<project-ref>.supabase.co/auth/v1". */
  issuer?: string;
}

/**
 * Verifies Supabase Auth JWTs.
 *
 * Strategy: prefer JWKS (asymmetric, supports key rotation without app changes).
 * Falls back to HS256 shared secret only when no JWKS URL is provided — this
 * exists for legacy projects that haven't migrated to asymmetric signing.
 */
export class SupabaseJwtVerifier {
  private readonly getKey: JWTVerifyGetKey | Uint8Array;
  private readonly audience: string;
  private readonly issuer?: string;

  constructor(opts: JwtVerifierOptions) {
    if (opts.jwksUrl) {
      this.getKey = createRemoteJWKSet(new URL(opts.jwksUrl));
    } else if (opts.jwtSecret) {
      this.getKey = new TextEncoder().encode(opts.jwtSecret);
    } else {
      throw new Error(
        "JwtVerifierOptions: provide jwksUrl (preferred) or jwtSecret"
      );
    }
    this.audience = opts.audience ?? "authenticated";
    this.issuer = opts.issuer;
  }

  async verify(token: string): Promise<AuthPrincipal> {
    const { payload } = await jwtVerify(
      token,
      // jose accepts either a key resolver function or a raw key
      this.getKey as JWTVerifyGetKey,
      {
        audience: this.audience,
        ...(this.issuer ? { issuer: this.issuer } : {})
      }
    );

    if (!payload.sub) throw new Error("JWT missing 'sub' claim");

    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      role: (payload.role as AuthPrincipal["role"]) ?? "authenticated",
      aud: String(payload.aud),
      issuedAt: payload.iat ?? 0,
      expiresAt: payload.exp ?? 0,
      raw: payload as Record<string, unknown>
    };
  }
}
