import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { FormPurpose, Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { RegistrationForm } from "../../domain/entities/registration-form.entity";
import {
  RegistrationFormId,
  RegistrationFormVersionId
} from "../../domain/identifiers";
import type {
  FormVersionRow,
  ListRegistrationFormsQuery,
  RegistrationFormRepository
} from "../../domain/repositories/registration-form.repository";

@Injectable()
export class DrizzleRegistrationFormRepository
  implements RegistrationFormRepository
{
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: RegistrationFormId): Promise<RegistrationForm | null> {
    const [row] = await this.db
      .select()
      .from(schema.registrationForms)
      .where(eq(schema.registrationForms.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListRegistrationFormsQuery): Promise<Page<RegistrationForm>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.registrationForms.orgId, q.orgId));
    if (q.scope) cs.push(eq(schema.registrationForms.scope, q.scope));
    if (q.scopeId) cs.push(eq(schema.registrationForms.scopeId, q.scopeId));
    if (q.purpose) cs.push(eq(schema.registrationForms.purpose, q.purpose));
    if (q.role) {
      // role match = `applies_to_roles @> ARRAY[role]` OR empty array
      // (which means "applies to every role in scope").
      cs.push(
        or(
          sql`${schema.registrationForms.appliesToRoles} @> ARRAY[${q.role}]::text[]`,
          sql`array_length(${schema.registrationForms.appliesToRoles}, 1) IS NULL`
        )!
      );
    }
    if (q.search)
      cs.push(ilike(schema.registrationForms.name, `%${q.search}%`));
    if (q.cursor) cs.push(gt(schema.registrationForms.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.registrationForms)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.registrationForms.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(f: RegistrationForm): Promise<void> {
    const x = f.toSnapshot();
    await this.db.insert(schema.registrationForms).values({
      id: x.id,
      orgId: x.orgId,
      scope: x.scope,
      scopeId: x.scopeId,
      seasonId: x.seasonId,
      name: x.name,
      description: x.description,
      purpose: x.purpose,
      appliesToRoles: x.appliesToRoles,
      activeVersionId: x.activeVersionId
    });
  }

  async save(f: RegistrationForm): Promise<void> {
    const x = f.toSnapshot();
    await this.db
      .update(schema.registrationForms)
      .set({
        name: x.name,
        description: x.description,
        seasonId: x.seasonId,
        purpose: x.purpose,
        appliesToRoles: x.appliesToRoles,
        activeVersionId: x.activeVersionId,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.registrationForms.id, x.id));
  }

  // -------- versions --------

  async findVersion(id: RegistrationFormVersionId): Promise<FormVersionRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.registrationFormVersions)
      .where(eq(schema.registrationFormVersions.id, id.value))
      .limit(1);
    return row ? this.toVersionRow(row) : null;
  }

  async listVersions(formId: RegistrationFormId): Promise<FormVersionRow[]> {
    const rows = await this.db
      .select()
      .from(schema.registrationFormVersions)
      .where(eq(schema.registrationFormVersions.formId, formId.value))
      .orderBy(desc(schema.registrationFormVersions.versionNumber));
    return rows.map((r) => this.toVersionRow(r));
  }

  async insertVersion(row: FormVersionRow): Promise<void> {
    await this.db.insert(schema.registrationFormVersions).values({
      id: row.id,
      formId: row.formId,
      versionNumber: row.versionNumber,
      schema: row.schema,
      publishedAt: row.publishedAt,
      locked: row.locked
    });
  }

  async publishVersion(id: RegistrationFormVersionId): Promise<void> {
    await this.db
      .update(schema.registrationFormVersions)
      .set({ publishedAt: sql`NOW()`, locked: true })
      .where(eq(schema.registrationFormVersions.id, id.value));
  }

  async nextVersionNumber(formId: RegistrationFormId): Promise<number> {
    const [row] = await this.db
      .select({
        max: sql<number>`COALESCE(MAX(${schema.registrationFormVersions.versionNumber}), 0)`
      })
      .from(schema.registrationFormVersions)
      .where(eq(schema.registrationFormVersions.formId, formId.value));
    return Number(row?.max ?? 0) + 1;
  }

  private toDomain(r: typeof schema.registrationForms.$inferSelect): RegistrationForm {
    return RegistrationForm.rehydrate({
      id: r.id,
      orgId: r.orgId,
      scope: r.scope as never,
      scopeId: r.scopeId,
      seasonId: r.seasonId,
      name: r.name,
      description: r.description,
      purpose: r.purpose as FormPurpose,
      appliesToRoles: r.appliesToRoles ?? [],
      activeVersionId: r.activeVersionId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  }

  private toVersionRow(
    r: typeof schema.registrationFormVersions.$inferSelect
  ): FormVersionRow {
    return {
      id: r.id,
      formId: r.formId,
      versionNumber: r.versionNumber,
      schema: r.schema as Record<string, unknown>,
      publishedAt: r.publishedAt,
      locked: r.locked,
      createdAt: r.createdAt
    };
  }
}
