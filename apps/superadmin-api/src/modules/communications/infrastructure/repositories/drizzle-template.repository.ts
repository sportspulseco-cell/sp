import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type {
  ListTemplatesQuery,
  NotificationTemplateRepository,
  NotificationTemplateRow,
  UpsertTemplateInput
} from "../../domain/repositories/template.repository";

@Injectable()
export class DrizzleNotificationTemplateRepository
  implements NotificationTemplateRepository
{
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(q: ListTemplatesQuery): Promise<Page<NotificationTemplateRow>> {
    const cs = [];
    if (q.orgId === null) cs.push(isNull(schema.notificationTemplates.orgId));
    else if (q.orgId) cs.push(eq(schema.notificationTemplates.orgId, q.orgId));
    if (q.code) cs.push(eq(schema.notificationTemplates.code, q.code));
    if (q.channel) cs.push(eq(schema.notificationTemplates.channel, q.channel));
    if (q.locale) cs.push(eq(schema.notificationTemplates.locale, q.locale));
    if (q.cursor) cs.push(gt(schema.notificationTemplates.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.notificationTemplates)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(
        asc(schema.notificationTemplates.code),
        asc(schema.notificationTemplates.channel),
        asc(schema.notificationTemplates.locale)
      )
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toRow(r)
    );
    return { items, nextCursor: hasMore ? rows[q.limit - 1]!.id : null };
  }

  async findById(id: string): Promise<NotificationTemplateRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.notificationTemplates)
      .where(eq(schema.notificationTemplates.id, id));
    return row ? this.toRow(row) : null;
  }

  async upsert(input: UpsertTemplateInput): Promise<NotificationTemplateRow> {
    if (input.id) {
      await this.db
        .update(schema.notificationTemplates)
        .set({
          orgId: input.orgId ?? null,
          code: input.code,
          channel: input.channel,
          locale: input.locale ?? "en",
          subject: input.subject ?? null,
          bodyTemplate: input.bodyTemplate,
          variables: input.variables ?? [],
          isActive: input.isActive ?? true,
          updatedAt: sql`NOW()`
        })
        .where(eq(schema.notificationTemplates.id, input.id));
      const found = await this.findById(input.id);
      if (!found) throw new Error("template not found");
      return found;
    }

    await this.db
      .insert(schema.notificationTemplates)
      .values({
        orgId: input.orgId ?? null,
        code: input.code,
        channel: input.channel,
        locale: input.locale ?? "en",
        subject: input.subject ?? null,
        bodyTemplate: input.bodyTemplate,
        variables: input.variables ?? [],
        isActive: input.isActive ?? true
      })
      .onConflictDoUpdate({
        target: [
          schema.notificationTemplates.orgId,
          schema.notificationTemplates.code,
          schema.notificationTemplates.channel,
          schema.notificationTemplates.locale
        ],
        set: {
          subject: input.subject ?? null,
          bodyTemplate: input.bodyTemplate,
          variables: input.variables ?? [],
          isActive: input.isActive ?? true,
          updatedAt: sql`NOW()`
        }
      });
    // Read back via the unique key.
    const [row] = await this.db
      .select()
      .from(schema.notificationTemplates)
      .where(
        and(
          input.orgId
            ? eq(schema.notificationTemplates.orgId, input.orgId)
            : isNull(schema.notificationTemplates.orgId),
          eq(schema.notificationTemplates.code, input.code),
          eq(schema.notificationTemplates.channel, input.channel),
          eq(schema.notificationTemplates.locale, input.locale ?? "en")
        )
      );
    if (!row) throw new Error("template upsert failed");
    return this.toRow(row);
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(schema.notificationTemplates)
      .where(eq(schema.notificationTemplates.id, id));
  }

  private toRow(
    r: typeof schema.notificationTemplates.$inferSelect
  ): NotificationTemplateRow {
    return {
      id: r.id,
      orgId: r.orgId,
      code: r.code,
      channel: r.channel,
      locale: r.locale,
      subject: r.subject,
      bodyTemplate: r.bodyTemplate,
      variables: (r.variables ?? []) as string[],
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }
}
