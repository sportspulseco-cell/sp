import { Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../../../../shared/auth/supabase-admin.service";

export interface SendRecoveryEmailInput {
  userId: string;
}

/**
 * Trigger a Supabase password-recovery email for a user. Used from the
 * super-admin user detail page when a user reports they can't sign in.
 * Supabase handles the email send; we just confirm to the UI where it went.
 */
@Injectable()
export class SendRecoveryEmailHandler {
  private readonly log = new Logger(SendRecoveryEmailHandler.name);

  constructor(private readonly supabase: SupabaseAdminService) {}

  async execute(
    input: SendRecoveryEmailInput
  ): Promise<{ ok: true; email: string }> {
    const { email } = await this.supabase.sendRecoveryEmail(input.userId);
    this.log.log(`recovery email dispatched to ${email} for ${input.userId}`);
    return { ok: true, email };
  }
}
