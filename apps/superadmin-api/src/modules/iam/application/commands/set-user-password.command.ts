import { Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../../../../shared/auth/supabase-admin.service";

export interface SetUserPasswordInput {
  userId: string;
  password: string;
}

/**
 * Force-set an existing user's password via Supabase admin API.
 *
 * Triggered from the /users actions menu when an admin needs to hand a
 * user fresh credentials (e.g. team captain forgot their password and
 * needs to log in before tonight's game). Audit interceptor records the
 * call; the password itself never appears in audit logs (the body is
 * scrubbed).
 */
@Injectable()
export class SetUserPasswordHandler {
  private readonly log = new Logger(SetUserPasswordHandler.name);

  constructor(private readonly supabase: SupabaseAdminService) {}

  async execute(input: SetUserPasswordInput): Promise<void> {
    if (!input.password || input.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    await this.supabase.setUserPassword(input.userId, input.password);
    this.log.log(`password reset for user ${input.userId}`);
  }
}
