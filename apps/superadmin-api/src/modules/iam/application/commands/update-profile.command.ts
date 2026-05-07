import { Inject, Injectable } from "@nestjs/common";
import { NotFoundError, type CommandHandler } from "@sportspulse/kernel";
import {
  PROFILE_REPOSITORY,
  type ProfileRepository
} from "../../domain/repositories/profile.repository";
import { UserId } from "../../domain/identifiers";
import { ProfileDto } from "../dtos/profile.dto";

export interface UpdateProfileInput {
  userId: string;
  legalFirstName?: string | null;
  legalLastName?: string | null;
  preferredName?: string | null;
  displayName?: string | null;
  locale?: string;
  timezone?: string;
  countryCode?: string | null;
}

@Injectable()
export class UpdateProfileHandler
  implements CommandHandler<UpdateProfileInput, ProfileDto>
{
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository
  ) {}

  async execute(input: UpdateProfileInput): Promise<ProfileDto> {
    const profile = await this.profiles.findById(UserId.of(input.userId));
    if (!profile) throw new NotFoundError("Profile", input.userId);
    profile.rename({
      legalFirstName: input.legalFirstName,
      legalLastName: input.legalLastName,
      preferredName: input.preferredName,
      displayName: input.displayName
    });
    if (input.locale) profile.setLocale(input.locale, input.timezone);
    if (input.countryCode !== undefined)
      profile.setCountryCode(input.countryCode);
    await this.profiles.save(profile);
    return ProfileDto.fromDomain(profile);
  }
}
