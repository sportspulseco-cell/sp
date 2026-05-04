import { Inject, Injectable } from "@nestjs/common";
import { NotFoundError, type QueryHandler } from "@sportspulse/kernel";
import {
  PROFILE_REPOSITORY,
  type ProfileRepository
} from "../../domain/repositories/profile.repository";
import { UserId } from "../../domain/identifiers";
import { ProfileDto } from "../dtos/profile.dto";

export interface GetCurrentUserInput {
  userId: string;
}

@Injectable()
export class GetCurrentUserHandler
  implements QueryHandler<GetCurrentUserInput, ProfileDto>
{
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository
  ) {}

  async execute(input: GetCurrentUserInput): Promise<ProfileDto> {
    const profile = await this.profiles.findById(UserId.of(input.userId));
    if (!profile) throw new NotFoundError("Profile", input.userId);
    return ProfileDto.fromDomain(profile);
  }
}
