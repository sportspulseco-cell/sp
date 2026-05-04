import type { Page, PageQuery } from "@sportspulse/kernel";
import { UserId } from "../identifiers";
import type { Profile } from "../entities/profile.entity";

// DIP — domain depends on this abstraction; infra provides the impl.
export interface ProfileRepository {
  findById(id: UserId): Promise<Profile | null>;
  findByEmail(email: string): Promise<Profile | null>;
  list(query: ListProfilesQuery): Promise<Page<Profile>>;
  save(profile: Profile): Promise<void>;
}

export interface ListProfilesQuery extends PageQuery {
  status?: "pending" | "active" | "suspended" | "deleted";
  search?: string; // matches email / display_name / legal_first_name / legal_last_name
  countryCode?: string;
  isSuperAdmin?: boolean;
}

export const PROFILE_REPOSITORY = Symbol("PROFILE_REPOSITORY");
