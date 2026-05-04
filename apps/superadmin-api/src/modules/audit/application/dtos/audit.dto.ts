import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { AuditEventRow } from "../../domain/repositories/audit.repository";

export class AuditEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() tsUtc!: string;
  @ApiPropertyOptional({ nullable: true }) orgId!: string | null;
  @ApiPropertyOptional({ nullable: true }) actorUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) onBehalfOfUserId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() resourceType!: string;
  @ApiPropertyOptional({ nullable: true }) resourceId!: string | null;
  @ApiPropertyOptional({ nullable: true }) before!: Record<string, unknown> | null;
  @ApiPropertyOptional({ nullable: true }) after!: Record<string, unknown> | null;
  @ApiPropertyOptional({ nullable: true }) ipAddr!: string | null;
  @ApiPropertyOptional({ nullable: true }) userAgent!: string | null;
  @ApiPropertyOptional({ nullable: true }) requestId!: string | null;
  @ApiProperty() retentionClass!: string;
  @ApiProperty() createdAt!: string;

  static fromRow(r: AuditEventRow): AuditEventDto {
    return {
      id: r.id,
      tsUtc: r.tsUtc.toISOString(),
      orgId: r.orgId,
      actorUserId: r.actorUserId,
      onBehalfOfUserId: r.onBehalfOfUserId,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      before: r.before,
      after: r.after,
      ipAddr: r.ipAddr,
      userAgent: r.userAgent,
      requestId: r.requestId,
      retentionClass: r.retentionClass,
      createdAt: r.createdAt.toISOString()
    };
  }
}

export class AuditEventPageDto {
  @ApiProperty({ type: [AuditEventDto] }) items!: AuditEventDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class AuditFacetsDto {
  @ApiProperty({ type: [String] }) actions!: string[];
  @ApiProperty({ type: [String] }) resourceTypes!: string[];
}
