import type { Page, PageQuery } from "@sportspulse/kernel";

export interface AuditEventRow {
  id: string;
  tsUtc: Date;
  orgId: string | null;
  actorUserId: string | null;
  onBehalfOfUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddr: string | null;
  userAgent: string | null;
  requestId: string | null;
  retentionClass: string;
  createdAt: Date;
}

export interface ListAuditQuery extends PageQuery {
  orgId?: string;
  actorUserId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  fromTs?: string;
  toTs?: string;
  /**
   * When set, restricts results to events where `org_id IN orgIdsFilter`
   * OR `actor_user_id = currentUserId` (so the principal always sees their
   * own actions even outside their org scope).
   */
  orgIdsFilter?: string[];
  currentUserId?: string;
}

export interface AuditRepository {
  list(q: ListAuditQuery): Promise<Page<AuditEventRow>>;
  findById(id: string): Promise<AuditEventRow | null>;
  /** Distinct (action) values, sorted, for filter UI dropdowns. */
  distinctActions(limit?: number): Promise<string[]>;
  /** Distinct resource_type values. */
  distinctResourceTypes(): Promise<string[]>;
}

export const AUDIT_REPOSITORY = Symbol("AUDIT_REPOSITORY");
