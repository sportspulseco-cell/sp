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
   */
  async inviteUserByEmail(input: {
    email: string;
    displayName?: string | null;
    redirectTo?: string;
  }): Promise<{ userId: string; created: boolean }> {
    const c = this.get();

    // If the email is already registered, look it up — Supabase returns an
    // error when invoked twice for the same address.
    const existing = await this.findUserByEmail(input.email);
    if (existing) return { userId: existing, created: false };

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
   * Best-effort lookup by email. Pages through up to 1000 users — fine for
   * an MVP, replace with a server-side filter once we wire up the admin API
   * v2 listUsers (currently no `email` filter).
   */
  private async findUserByEmail(email: string): Promise<string | null> {
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
      if (match) return match.id;
      if (data.users.length < 100) return null;
      page++;
    }
    return null;
  }
}
