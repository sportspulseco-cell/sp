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
  /**
   * Filter to users who hold an active assignment of this role code
   * (e.g. "season_admin"). Used by the in-resource Assign-admin dialogs
   * so the dropdown only shows users already qualified for that role —
   * brand-new users come in through the invite tab instead.
   */
  roleCode?: string;
}

export const PROFILE_REPOSITORY = Symbol("PROFILE_REPOSITORY");
