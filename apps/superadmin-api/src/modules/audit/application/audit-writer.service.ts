import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";

export interface AuditWriteInput {
  actorUserId: string | null;
  orgId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddr?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

@Injectable()
export class AuditWriterService {
  private readonly log = new Logger(AuditWriterService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async write(input: AuditWriteInput): Promise<void> {
    try {
      await this.db.insert(schema.auditEvents).values({
        id: randomUUID(),
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        before: input.before ?? null,
        after: input.after ?? null,
        ipAddr: input.ipAddr ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null
      });
    } catch (err) {
      // Audit failures must never break the underlying write — log and move on.
      this.log.warn(
        `audit write failed for ${input.action} ${input.resourceType}: ${
          (err as Error).message
        }`
      );
    }
  }
}
