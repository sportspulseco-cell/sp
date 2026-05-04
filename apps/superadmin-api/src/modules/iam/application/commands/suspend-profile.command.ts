import { Inject, Injectable } from "@nestjs/common";
import { NotFoundError, type CommandHandler } from "@sportspulse/kernel";
import {
  PROFILE_REPOSITORY,
  type ProfileRepository
} from "../../domain/repositories/profile.repository";
import { UserId } from "../../domain/identifiers";
import { ProfileDto } from "../dtos/profile.dto";

export interface SuspendProfileInput {
  userId: string;
}

@Injectable()
export class SuspendProfileHandler
  implements CommandHandler<SuspendProfileInput, ProfileDto>
{
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository
  ) {}

  async execute(input: SuspendProfileInput): Promise<ProfileDto> {
    const profile = await this.profiles.findById(UserId.of(input.userId));
    if (!profile) throw new NotFoundError("Profile", input.userId);
    profile.suspend();
    await this.profiles.save(profile);
    return ProfileDto.fromDomain(profile);
  }
}
