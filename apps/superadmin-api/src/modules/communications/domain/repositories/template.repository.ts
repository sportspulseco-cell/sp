import type { Page, PageQuery } from "@sportspulse/kernel";

export interface NotificationTemplateRow {
  id: string;
  orgId: string | null;
  code: string;
  channel: string;
  locale: string;
  subject: string | null;
  bodyTemplate: string;
  variables: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListTemplatesQuery extends PageQuery {
  orgId?: string | null;
  code?: string;
  channel?: string;
  locale?: string;
}

export interface UpsertTemplateInput {
  id?: string;
  orgId?: string | null;
  code: string;
  channel: string;
  locale?: string;
  subject?: string | null;
  bodyTemplate: string;
  variables?: string[];
  isActive?: boolean;
}

export interface NotificationTemplateRepository {
  list(q: ListTemplatesQuery): Promise<Page<NotificationTemplateRow>>;
  findById(id: string): Promise<NotificationTemplateRow | null>;
  upsert(input: UpsertTemplateInput): Promise<NotificationTemplateRow>;
  delete(id: string): Promise<void>;
}

export const NOTIFICATION_TEMPLATE_REPOSITORY = Symbol(
  "NOTIFICATION_TEMPLATE_REPOSITORY"
);
