import { Inject, Injectable } from "@nestjs/common";
import { clampLimit, type Page, type QueryHandler } from "@sportspulse/kernel";
import {
  PROFILE_REPOSITORY,
  type ProfileRepository
} from "../../domain/repositories/profile.repository";
import { ProfileDto, ProfilePageDto } from "../dtos/profile.dto";

export interface ListProfilesInput {
  limit?: number;
  cursor?: string;
  status?: "pending" | "active" | "suspended" | "deleted";
  search?: string;
  countryCode?: string;
  isSuperAdmin?: boolean;
}

@Injectable()
export class ListProfilesHandler
  implements QueryHandler<ListProfilesInput, ProfilePageDto>
{
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository
  ) {}

  async execute(input: ListProfilesInput): Promise<ProfilePageDto> {
    const page: Page<import("../../domain/entities/profile.entity").Profile> =
      await this.profiles.list({
        limit: clampLimit(input.limit),
        cursor: input.cursor,
        status: input.status,
        search: input.search,
        countryCode: input.countryCode,
        isSuperAdmin: input.isSuperAdmin
      });
    return {
      items: page.items.map(ProfileDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}
