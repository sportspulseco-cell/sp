import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Wraps Supabase's service-role admin client. The client is created lazily
 * once per process lifetime — it carries the SERVICE_ROLE_KEY and bypasses
 * RLS, so the only callers should be NestJS handlers gated by the existing
 * SuperAdminGuard / RolesGuard pipeline.
 *
 * Reused by every flow that needs to mint or modify auth users (invite,
 * password reset, force-link, etc). Do not duplicate `createClient` calls
 * elsewhere in the codebase.
 */
@Injectable()
export class SupabaseAdminService {
  private readonly log = new Logger(SupabaseAdminService.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  private get(): SupabaseClient {
    if (this.client) return this.client;
    const url = this.config.getOrThrow<string>("SUPABASE_URL");
    const key = this.config.getOrThrow<string>("SUPABASE_SERVICE_ROLE_KEY");
    this.client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    return this.client;
  }

  /**
   * Send a Supabase-managed invite email. Returns the new auth user id and
   * a boolean `created` flag (false when the user already existed).
   *
   * If `password` is provided, the user is created with that password
   * directly (auto-confirmed) instead of going through the magic-link
   * flow. The caller is responsible for delivering the credentials to
   * the user out-of-band — this method does not email a password.
   */
  async inviteUserByEmail(input: {
    email: string;
    displayName?: string | null;
    redirectTo?: string;
    password?: string | null;
  }): Promise<{ userId: string; created: boolean }> {
    const c = this.get();

    // If the email is already registered, look it up — Supabase returns an
    // error when invoked twice for the same address.
    const existing = await this.findUserByEmail(input.email);
    if (existing) return { userId: existing, created: false };

    if (input.password) {
      // `email_confirm` defaults to true (mock flow — skip the
      // verification roundtrip so flows complete in one step).
      // Flip `SUPABASE_REQUIRE_EMAIL_CONFIRM=true` in env to enforce
      // real verification: Supabase emails the user a confirmation
      // link, and sign-in is blocked until they click it. Each app's
      // /auth/callback route exchanges the code for a session.
      const requireConfirm =
        this.config.get<string>("SUPABASE_REQUIRE_EMAIL_CONFIRM") === "true";
      const { data, error } = await c.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: !requireConfirm,
        user_metadata: input.displayName
          ? { display_name: input.displayName }
          : undefined
      });
      if (error) {
        this.log.warn(
          `createUser failed for ${input.email}: ${error.message}`
        );
        throw new Error(error.message);
      }
      if (!data?.user?.id) throw new Error("Supabase createUser returned no user");
      return { userId: data.user.id, created: true };
    }

    const { data, error } = await c.auth.admin.inviteUserByEmail(input.email, {
      data: input.displayName ? { display_name: input.displayName } : undefined,
      redirectTo: input.redirectTo
    });
    if (error) {
      this.log.warn(`invite failed for ${input.email}: ${error.message}`);
      throw new Error(error.message);
    }
    if (!data?.user?.id) throw new Error("Supabase invite returned no user");
    return { userId: data.user.id, created: true };
  }

  /**
   * Force-update an existing user's password. Used by the super-admin
   * "Set password" action on /users.
   */
  async setUserPassword(userId: string, password: string): Promise<void> {
    const c = this.get();
    const { error } = await c.auth.admin.updateUserById(userId, { password });
    if (error) {
      this.log.warn(`setUserPassword failed for ${userId}: ${error.message}`);
      throw new Error(error.message);
    }
  }

  /**
   * Flip `app_metadata.profile_complete = true` (or false) so the
   * per-app middleware knows whether to redirect first-time sign-ins
   * to /onboarding. Merges with existing metadata so other keys (e.g.
   * role_codes) survive.
   */
  async setProfileComplete(userId: string, complete: boolean): Promise<void> {
    const c = this.get();
    const { data: cur, error: readErr } = await c.auth.admin.getUserById(userId);
    if (readErr) throw new Error(readErr.message);
    const existing = (cur.user?.app_metadata ?? {}) as Record<string, unknown>;
    const merged = { ...existing, profile_complete: complete };
    const { error } = await c.auth.admin.updateUserById(userId, {
      app_metadata: merged
    });
    if (error) {
      this.log.warn(
        `setProfileComplete failed for ${userId}: ${error.message}`
      );
      throw new Error(error.message);
    }
  }

  /**
   * Mirror a user's active role codes into Supabase JWT
   * `app_metadata.role_codes`. Called by every IAM mutation that
   * changes which roles a user holds (assignRole, revokeAssignment,
   * inviteUser-with-role). Each app's middleware reads this metadata
   * via `@sportspulse/auth/web` requireRole helper — saves a per-
   * request roundtrip to the API on every page load.
   *
   * Token holders need a refresh (sign-out / sign-in or Supabase's
   * automatic refresh interval) for the new metadata to land in their
   * JWT. Acceptable for our flow: admin grants role, user signs in,
   * fresh JWT carries the new code.
   */
  async setRoleCodes(userId: string, roleCodes: string[]): Promise<void> {
    const c = this.get();
    // Read current app_metadata so we don't clobber unrelated keys.
    const { data: cur, error: readErr } = await c.auth.admin.getUserById(userId);
    if (readErr) {
      this.log.warn(
        `setRoleCodes read failed for ${userId}: ${readErr.message}`
      );
      throw new Error(readErr.message);
    }
    const existing = (cur.user?.app_metadata ?? {}) as Record<string, unknown>;
    const merged = {
      ...existing,
      role_codes: Array.from(new Set(roleCodes))
    };
    const { error } = await c.auth.admin.updateUserById(userId, {
      app_metadata: merged
    });
    if (error) {
      this.log.warn(`setRoleCodes failed for ${userId}: ${error.message}`);
      throw new Error(error.message);
    }
  }

  /**
   * Best-effort lookup by email. Pages through up to 1000 users — fine for
   * an MVP, replace with a server-side filter once we wire up the admin API
   * v2 listUsers (currently no `email` filter).
   */
  private async findUserByEmail(email: string): Promise<string | null> {
    const detail = await this.findUserDetailByEmail(email);
    return detail?.userId ?? null;
  }

  /**
   * Public variant of {@link findUserByEmail} that also returns the
   * user's display_name from auth metadata. Used by the public
   * "Sign in & resume" flow on the registration funnel — the funnel
   * needs the existing displayName to skip re-collecting first/last
   * name.
   */
  async findUserDetailByEmail(
    email: string
  ): Promise<{ userId: string; displayName: string | null } | null> {
    const c = this.get();
    let page = 1;
    while (page <= 10) {
      const { data, error } = await c.auth.admin.listUsers({
        page,
        perPage: 100
      });
      if (error) throw new Error(error.message);
      const match = data.users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (match) {
        const meta = (match.user_metadata ?? {}) as {
          display_name?: string;
        };
        return {
          userId: match.id,
          displayName: meta.display_name ?? null
        };
      }
      if (data.users.length < 100) return null;
      page++;
    }
    return null;
  }
}
