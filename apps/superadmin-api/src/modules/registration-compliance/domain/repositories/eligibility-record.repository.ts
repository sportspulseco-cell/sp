import type { Page, PageQuery } from "@sportspulse/kernel";
import type { EligibilityRecord } from "../entities/eligibility-record.entity";
import { EligibilityRecordId } from "../identifiers";

export interface ListEligibilityQuery extends PageQuery {
  personId?: string;
  seasonId?: string;
  governingBodyId?: string;
  status?: string;
}

export interface EligibilityRecordRepository {
  findById(id: EligibilityRecordId): Promise<EligibilityRecord | null>;
  list(q: ListEligibilityQuery): Promise<Page<EligibilityRecord>>;
  insert(rec: EligibilityRecord): Promise<void>;
  save(rec: EligibilityRecord): Promise<void>;
}

export const ELIGIBILITY_RECORD_REPOSITORY = Symbol(
  "ELIGIBILITY_RECORD_REPOSITORY"
);
