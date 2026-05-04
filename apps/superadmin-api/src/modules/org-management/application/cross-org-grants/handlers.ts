import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  CROSS_ORG_GRANT_REPOSITORY,
  type CrossOrgGrantRepository
} from "../../domain/repositories/cross-org-grant.repository";
import { CrossOrgGrantId, OrgId } from "../../domain/identifiers";
import { CrossOrgGrant } from "../../domain/entities/cross-org-grant.entity";
import { CrossOrgGrantDto } from "../dtos/org.dto";

export interface IssueCrossOrgGrantInput {
  userId: string;
  fromOrgId: string;
  toOrgId: string;
  permissions?: string[];
  grantedByUserId?: string | null;
}

@Injectable()
export class IssueCrossOrgGrantHandler
  implements CommandHandler<IssueCrossOrgGrantInput, CrossOrgGrantDto>
{
  constructor(
    @Inject(CROSS_ORG_GRANT_REPOSITORY)
    private readonly grants: CrossOrgGrantRepository
  ) {}
  async execute(input: IssueCrossOrgGrantInput): Promise<CrossOrgGrantDto> {
    const grant = CrossOrgGrant.create({
      id: CrossOrgGrantId.of(randomUUID()),
      userId: input.userId,
      fromOrgId: OrgId.of(input.fromOrgId),
      toOrgId: OrgId.of(input.toOrgId),
      permissions: input.permissions,
      grantedByUserId: input.grantedByUserId ?? null
    });
    await this.grants.insert(grant);
    return CrossOrgGrantDto.fromDomain(grant);
  }
}

@Injectable()
export class RevokeCrossOrgGrantHandler
  implements CommandHandler<{ id: string }, CrossOrgGrantDto>
{
  constructor(
    @Inject(CROSS_ORG_GRANT_REPOSITORY)
    private readonly grants: CrossOrgGrantRepository
  ) {}
  async execute(input: { id: string }): Promise<CrossOrgGrantDto> {
    const grant = await this.grants.findById(CrossOrgGrantId.of(input.id));
    if (!grant) throw new NotFoundError("CrossOrgGrant", input.id);
    grant.revoke();
    await this.grants.save(grant);
    return CrossOrgGrantDto.fromDomain(grant);
  }
}

@Injectable()
export class ListGrantsByUserHandler
  implements QueryHandler<{ userId: string }, CrossOrgGrantDto[]>
{
  constructor(
    @Inject(CROSS_ORG_GRANT_REPOSITORY)
    private readonly grants: CrossOrgGrantRepository
  ) {}
  async execute(input: { userId: string }): Promise<CrossOrgGrantDto[]> {
    const rs = await this.grants.listByUser(input.userId);
    return rs.map(CrossOrgGrantDto.fromDomain);
  }
}

@Injectable()
export class ListGrantsByOrgHandler
  implements QueryHandler<{ orgId: string }, CrossOrgGrantDto[]>
{
  constructor(
    @Inject(CROSS_ORG_GRANT_REPOSITORY)
    private readonly grants: CrossOrgGrantRepository
  ) {}
  async execute(input: { orgId: string }): Promise<CrossOrgGrantDto[]> {
    const rs = await this.grants.listByOrg(OrgId.of(input.orgId));
    return rs.map(CrossOrgGrantDto.fromDomain);
  }
}
