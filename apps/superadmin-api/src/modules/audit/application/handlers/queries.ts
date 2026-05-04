import { Inject, Injectable } from "@nestjs/common";
import { clampLimit, NotFoundError } from "@sportspulse/kernel";
import {
  AUDIT_REPOSITORY,
  type AuditRepository,
  type ListAuditQuery
} from "../../domain/repositories/audit.repository";
import {
  AuditEventDto,
  AuditEventPageDto,
  AuditFacetsDto
} from "../dtos/audit.dto";

@Injectable()
export class ListAuditEventsHandler {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repo: AuditRepository
  ) {}

  async execute(q: Partial<ListAuditQuery> = {}): Promise<AuditEventPageDto> {
    if (q.orgIdsFilter && q.orgIdsFilter.length === 0 && !q.currentUserId) {
      return { items: [], nextCursor: null };
    }
    const page = await this.repo.list({
      ...q,
      limit: clampLimit(q.limit)
    });
    return {
      items: page.items.map((r) => AuditEventDto.fromRow(r)),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetAuditEventHandler {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repo: AuditRepository
  ) {}

  async execute({
    id,
    orgIdsFilter,
    currentUserId
  }: {
    id: string;
    orgIdsFilter?: string[];
    currentUserId?: string;
  }): Promise<AuditEventDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("AuditEvent", id);
    if (orgIdsFilter) {
      const inOrg = !!row.orgId && orgIdsFilter.includes(row.orgId);
      const isOwn = !!currentUserId && row.actorUserId === currentUserId;
      if (!inOrg && !isOwn) {
        throw new NotFoundError("AuditEvent", id);
      }
    }
    return AuditEventDto.fromRow(row);
  }
}

@Injectable()
export class AuditFacetsHandler {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repo: AuditRepository
  ) {}

  async execute(): Promise<AuditFacetsDto> {
    const [actions, resourceTypes] = await Promise.all([
      this.repo.distinctActions(),
      this.repo.distinctResourceTypes()
    ]);
    return { actions, resourceTypes };
  }
}
