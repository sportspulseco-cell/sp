import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ConflictError,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  ORG_RELATION_REPOSITORY,
  type OrgRelationRepository
} from "../../domain/repositories/org-relation.repository";
import { OrgId, OrgRelationId } from "../../domain/identifiers";
import {
  OrgRelation,
  type RelationKind
} from "../../domain/entities/org-relation.entity";
import { OrgRelationDto } from "../dtos/org.dto";

export interface LinkOrgsInput {
  parentOrgId: string;
  childOrgId: string;
  relation: RelationKind;
}

@Injectable()
export class LinkOrgsHandler
  implements CommandHandler<LinkOrgsInput, OrgRelationDto>
{
  constructor(
    @Inject(ORG_RELATION_REPOSITORY)
    private readonly relations: OrgRelationRepository
  ) {}

  async execute(input: LinkOrgsInput): Promise<OrgRelationDto> {
    const existing = await this.relations.findByEdge(
      OrgId.of(input.parentOrgId),
      OrgId.of(input.childOrgId),
      input.relation
    );
    if (existing) {
      throw new ConflictError("Relation already exists");
    }
    const rel = OrgRelation.create({
      id: OrgRelationId.of(randomUUID()),
      parentOrgId: OrgId.of(input.parentOrgId),
      childOrgId: OrgId.of(input.childOrgId),
      relation: input.relation
    });
    await this.relations.insert(rel);
    return OrgRelationDto.fromDomain(rel);
  }
}

@Injectable()
export class UnlinkOrgsHandler
  implements CommandHandler<{ id: string }, OrgRelationDto>
{
  constructor(
    @Inject(ORG_RELATION_REPOSITORY)
    private readonly relations: OrgRelationRepository
  ) {}
  async execute(input: { id: string }): Promise<OrgRelationDto> {
    const rel = await this.relations.findById(OrgRelationId.of(input.id));
    if (!rel) throw new NotFoundError("OrgRelation", input.id);
    rel.end();
    await this.relations.save(rel);
    return OrgRelationDto.fromDomain(rel);
  }
}

@Injectable()
export class ListOrgChildrenHandler
  implements QueryHandler<{ orgId: string }, OrgRelationDto[]>
{
  constructor(
    @Inject(ORG_RELATION_REPOSITORY)
    private readonly relations: OrgRelationRepository
  ) {}
  async execute(input: { orgId: string }): Promise<OrgRelationDto[]> {
    const rs = await this.relations.listChildren(OrgId.of(input.orgId));
    return rs.map(OrgRelationDto.fromDomain);
  }
}

@Injectable()
export class ListOrgParentsHandler
  implements QueryHandler<{ orgId: string }, OrgRelationDto[]>
{
  constructor(
    @Inject(ORG_RELATION_REPOSITORY)
    private readonly relations: OrgRelationRepository
  ) {}
  async execute(input: { orgId: string }): Promise<OrgRelationDto[]> {
    const rs = await this.relations.listParents(OrgId.of(input.orgId));
    return rs.map(OrgRelationDto.fromDomain);
  }
}
