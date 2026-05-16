import type { Page, PageQuery } from "@sportspulse/kernel";
import type { Org } from "../entities/org.entity";
import { OrgId } from "../identifiers";

export interface ListOrgsQuery extends PageQuery {
  status?: string;
  countryCode?: string;
  orgType?: string;
  search?: string;
}

export interface OrgRepository {
  findById(id: OrgId): Promise<Org | null>;
  findBySlug(slug: string): Promise<Org | null>;
  /**
   * BUG-007 — used by CreateOrgHandler / UpdateOrgHandler to surface a
   * friendly 409 before Postgres rejects on the partial unique index
   * `orgs_legal_name_lower_unique` (migration 0040). Case-insensitive,
   * skips soft-deleted rows.
   */
  findByLegalName(legalName: string): Promise<Org | null>;
  list(q: ListOrgsQuery): Promise<Page<Org>>;
  insert(org: Org): Promise<void>;
  save(org: Org): Promise<void>;
}

export const ORG_REPOSITORY = Symbol("ORG_REPOSITORY");
