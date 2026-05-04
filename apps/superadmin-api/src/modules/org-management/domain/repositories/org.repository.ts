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
  list(q: ListOrgsQuery): Promise<Page<Org>>;
  insert(org: Org): Promise<void>;
  save(org: Org): Promise<void>;
}

export const ORG_REPOSITORY = Symbol("ORG_REPOSITORY");
