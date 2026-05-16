import { Inject, Injectable, Logger } from "@nestjs/common";
import { NotFoundError, type CommandHandler } from "@sportspulse/kernel";
import {
  PROFILE_REPOSITORY,
  type ProfileRepository
} from "../../domain/repositories/profile.repository";
import { UserId } from "../../domain/identifiers";
import { ProfileDto } from "../dtos/profile.dto";
import { SupabaseAdminService } from "../../../../shared/auth/supabase-admin.service";

export interface ReactivateProfileInput {
  userId: string;
}

@Injectable()
export class ReactivateProfileHandler
  implements CommandHandler<ReactivateProfileInput, ProfileDto>
{
  private readonly log = new Logger(ReactivateProfileHandler.name);

  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository,
    private readonly supabase: SupabaseAdminService
  ) {}

  async execute(input: ReactivateProfileInput): Promise<ProfileDto> {
    const profile = await this.profiles.findById(UserId.of(input.userId));
    if (!profile) throw new NotFoundError("Profile", input.userId);
    profile.reactivate();
    await this.profiles.save(profile);
    // Mirror the unsuspend on the auth side (BUG-017 fix).
    try {
      await this.supabase.setUserBanned(input.userId, false);
    } catch (e) {
      this.log.warn(
        `setUserBanned(false) failed for ${input.userId}: ${(e as Error).message}`
      );
    }
    return ProfileDto.fromDomain(profile);
  }
}
