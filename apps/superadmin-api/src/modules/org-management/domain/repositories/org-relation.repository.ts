import type { OrgRelation } from "../entities/org-relation.entity";
import { OrgRelationId, OrgId } from "../identifiers";

export interface OrgRelationRepository {
  findById(id: OrgRelationId): Promise<OrgRelation | null>;
  findByEdge(parent: OrgId, child: OrgId, relation: string): Promise<OrgRelation | null>;
  listChildren(parent: OrgId): Promise<OrgRelation[]>;
  listParents(child: OrgId): Promise<OrgRelation[]>;
  insert(rel: OrgRelation): Promise<void>;
  save(rel: OrgRelation): Promise<void>;
}

export const ORG_RELATION_REPOSITORY = Symbol("ORG_RELATION_REPOSITORY");
