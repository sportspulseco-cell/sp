import { Inject, Injectable } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { clampLimit, NotFoundError } from "@sportspulse/kernel";
import {
  NOTIFICATION_TEMPLATE_REPOSITORY,
  type ListTemplatesQuery,
  type NotificationTemplateRepository,
  type NotificationTemplateRow,
  type UpsertTemplateInput
} from "../../domain/repositories/template.repository";

export class NotificationTemplateDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) orgId!: string | null;
  @ApiProperty() code!: string;
  @ApiProperty() channel!: string;
  @ApiProperty() locale!: string;
  @ApiPropertyOptional({ nullable: true }) subject!: string | null;
  @ApiProperty() bodyTemplate!: string;
  @ApiProperty({ type: [String] }) variables!: string[];
  @ApiProperty() isActive!: boolean;
  @ApiProperty() updatedAt!: string;

  static fromRow(r: NotificationTemplateRow): NotificationTemplateDto {
    return {
      id: r.id,
      orgId: r.orgId,
      code: r.code,
      channel: r.channel,
      locale: r.locale,
      subject: r.subject,
      bodyTemplate: r.bodyTemplate,
      variables: r.variables,
      isActive: r.isActive,
      updatedAt: r.updatedAt.toISOString()
    };
  }
}

export class NotificationTemplatePageDto {
  @ApiProperty({ type: [NotificationTemplateDto] })
  items!: NotificationTemplateDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

@Injectable()
export class ListTemplatesHandler {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly repo: NotificationTemplateRepository
  ) {}
  async execute(
    q: Partial<ListTemplatesQuery> = {}
  ): Promise<NotificationTemplatePageDto> {
    const page = await this.repo.list({
      ...q,
      limit: clampLimit(q.limit)
    });
    return {
      items: page.items.map((r) => NotificationTemplateDto.fromRow(r)),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetTemplateHandler {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly repo: NotificationTemplateRepository
  ) {}
  async execute({ id }: { id: string }): Promise<NotificationTemplateDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("NotificationTemplate", id);
    return NotificationTemplateDto.fromRow(row);
  }
}

@Injectable()
export class UpsertTemplateHandler {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly repo: NotificationTemplateRepository
  ) {}
  async execute(input: UpsertTemplateInput): Promise<NotificationTemplateDto> {
    const row = await this.repo.upsert(input);
    return NotificationTemplateDto.fromRow(row);
  }
}

@Injectable()
export class DeleteTemplateHandler {
  constructor(
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly repo: NotificationTemplateRepository
  ) {}
  async execute({ id }: { id: string }) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("NotificationTemplate", id);
    await this.repo.delete(id);
    return { ok: true };
  }
}
