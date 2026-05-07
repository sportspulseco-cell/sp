import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { SupabaseAdminService } from "../../../../shared/auth/supabase-admin.service";

export interface SetRoleProfileInput {
  userId: string;
  /** e.g. "season_admin", "player", "free_agent" — keyed under metadata.roleProfile */
  roleCode: string;
  data: Record<string, unknown>;
  /**
   * When true, also flip `auth.users.app_metadata.profile_complete = true`
   * so per-app middleware stops bouncing this user to /onboarding.
   * Used by the onboarding wizard's Finish action.
   */
  complete?: boolean;
}

/**
 * Writes role-specific profile data into `profiles.metadata.roleProfile.<code>`.
 *
 * Schema is defined in @sportspulse/kernel (`ROLE_PROFILE_SCHEMAS`) and
 * validated client-side by the FormRenderer; the server treats the
 * payload as opaque JSONB. A user holding multiple roles ends up with
 * multiple entries (e.g. metadata.roleProfile.coach + .referee).
 *
 * Uses jsonb_set so concurrent edits to other top-level metadata keys
 * (display preferences, etc.) don't get clobbered.
 */
@Injectable()
export class SetRoleProfileHandler {
  private readonly log = new Logger(SetRoleProfileHandler.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly supabase: SupabaseAdminService
  ) {}

  async execute(input: SetRoleProfileInput): Promise<void> {
    if (!/^[a-z][a-z0-9_]{2,40}$/.test(input.roleCode)) {
      throw new Error(`Invalid roleCode: ${input.roleCode}`);
    }
    await this.db
      .update(schema.profiles)
      .set({
        metadata: sql`jsonb_set(
          coalesce(${schema.profiles.metadata}, '{}'::jsonb),
          ARRAY['roleProfile', ${input.roleCode}],
          ${JSON.stringify(input.data)}::jsonb,
          true
        )`,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.profiles.id, input.userId));
    this.log.log(
      `roleProfile updated for user=${input.userId} role=${input.roleCode}`
    );

    // Onboarding finish: flip the JWT flag so middleware stops
    // redirecting. Failure here is non-fatal — the profile data
    // landed; the flag will get set on the next save.
    if (input.complete) {
      try {
        await this.supabase.setProfileComplete(input.userId, true);
      } catch (e) {
        this.log.warn(
          `setProfileComplete failed for user=${input.userId}: ${(e as Error).message}`
        );
      }
    }
  }
}
