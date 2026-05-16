import { Inject, Injectable, Logger } from "@nestjs/common";
import { NotFoundError, type CommandHandler } from "@sportspulse/kernel";
import {
  PROFILE_REPOSITORY,
  type ProfileRepository
} from "../../domain/repositories/profile.repository";
import { UserId } from "../../domain/identifiers";
import { ProfileDto } from "../dtos/profile.dto";
import { SupabaseAdminService } from "../../../../shared/auth/supabase-admin.service";

export interface SuspendProfileInput {
  userId: string;
}

@Injectable()
export class SuspendProfileHandler
  implements CommandHandler<SuspendProfileInput, ProfileDto>
{
  private readonly log = new Logger(SuspendProfileHandler.name);

  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository,
    private readonly supabase: SupabaseAdminService
  ) {}

  async execute(input: SuspendProfileInput): Promise<ProfileDto> {
    const profile = await this.profiles.findById(UserId.of(input.userId));
    if (!profile) throw new NotFoundError("Profile", input.userId);
    profile.suspend();
    await this.profiles.save(profile);
    // Ban at the auth layer too — `profiles.status` alone is UI-only
    // (BUG-017). Failure here is logged but doesn't roll back the
    // profile change; the admin can re-run if Supabase was flaky.
    try {
      await this.supabase.setUserBanned(input.userId, true);
    } catch (e) {
      this.log.warn(
        `setUserBanned(true) failed for ${input.userId}: ${(e as Error).message}`
      );
    }
    return ProfileDto.fromDomain(profile);
  }
}
