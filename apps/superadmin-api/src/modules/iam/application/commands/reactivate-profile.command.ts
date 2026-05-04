import { Inject, Injectable } from "@nestjs/common";
import { NotFoundError, type CommandHandler } from "@sportspulse/kernel";
import {
  PROFILE_REPOSITORY,
  type ProfileRepository
} from "../../domain/repositories/profile.repository";
import { UserId } from "../../domain/identifiers";
import { ProfileDto } from "../dtos/profile.dto";

export interface ReactivateProfileInput {
  userId: string;
}

@Injectable()
export class ReactivateProfileHandler
  implements CommandHandler<ReactivateProfileInput, ProfileDto>
{
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository
  ) {}

  async execute(input: ReactivateProfileInput): Promise<ProfileDto> {
    const profile = await this.profiles.findById(UserId.of(input.userId));
    if (!profile) throw new NotFoundError("Profile", input.userId);
    profile.reactivate();
    await this.profiles.save(profile);
    return ProfileDto.fromDomain(profile);
  }
}
