import type { Page, PageQuery } from "@sportspulse/kernel";
import type { Registration } from "../entities/registration.entity";
import { RegistrationId } from "../identifiers";

export interface ListRegistrationsQuery extends PageQuery {
  orgId?: string;
  status?: string;
  leagueId?: string;
  divisionId?: string;
  teamId?: string;
  subjectPersonId?: string;
}

export interface RegistrationRepository {
  findById(id: RegistrationId): Promise<Registration | null>;
  findByIdempotencyKey(key: string): Promise<Registration | null>;
  list(q: ListRegistrationsQuery): Promise<Page<Registration>>;
  insert(reg: Registration): Promise<void>;
  save(reg: Registration): Promise<void>;
}

export const REGISTRATION_REPOSITORY = Symbol("REGISTRATION_REPOSITORY");
