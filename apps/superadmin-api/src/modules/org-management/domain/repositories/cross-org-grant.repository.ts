import type { CrossOrgGrant } from "../entities/cross-org-grant.entity";
import { CrossOrgGrantId, OrgId } from "../identifiers";

export interface CrossOrgGrantRepository {
  findById(id: CrossOrgGrantId): Promise<CrossOrgGrant | null>;
  listByUser(userId: string): Promise<CrossOrgGrant[]>;
  listByOrg(orgId: OrgId): Promise<CrossOrgGrant[]>;
  insert(grant: CrossOrgGrant): Promise<void>;
  save(grant: CrossOrgGrant): Promise<void>;
}

export const CROSS_ORG_GRANT_REPOSITORY = Symbol("CROSS_ORG_GRANT_REPOSITORY");
