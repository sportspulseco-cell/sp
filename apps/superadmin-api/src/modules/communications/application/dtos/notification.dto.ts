import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { NotificationRow } from "../../domain/repositories/notification.repository";

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) orgId!: string | null;
  @ApiProperty() idempotencyKey!: string;
  @ApiProperty() templateCode!: string;
  @ApiProperty() channel!: string;
  @ApiPropertyOptional({ nullable: true }) subject!: string | null;
  @ApiProperty() body!: string;
  @ApiPropertyOptional({ nullable: true }) recipientPersonId!: string | null;
  @ApiPropertyOptional({ nullable: true }) recipientEmail!: string | null;
  @ApiProperty() payload!: Record<string, unknown>;
  @ApiProperty() status!: string;
  @ApiProperty() attemptCount!: number;
  @ApiPropertyOptional({ nullable: true }) lastError!: string | null;
  @ApiPropertyOptional({ nullable: true }) sentAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) sourceEvent!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromRow(r: NotificationRow): NotificationDto {
    return {
      id: r.id,
      orgId: r.orgId,
      idempotencyKey: r.idempotencyKey,
      templateCode: r.templateCode,
      channel: r.channel,
      subject: r.subject,
      body: r.body,
      recipientPersonId: r.recipientPersonId,
      recipientEmail: r.recipientEmail,
      payload: r.payload,
      status: r.status,
      attemptCount: r.attemptCount,
      lastError: r.lastError,
      sentAt: r.sentAt?.toISOString() ?? null,
      sourceEvent: r.sourceEvent,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] }) items!: NotificationDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
