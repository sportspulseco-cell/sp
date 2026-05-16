import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, ilike, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Org } from "../../domain/entities/org.entity";
import { OrgId } from "../../domain/identifiers";
import type {
  ListOrgsQuery,
  OrgRepository
} from "../../domain/repositories/org.repository";

@Injectable()
export class DrizzleOrgRepository implements OrgRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: OrgId): Promise<Org | null> {
    const [row] = await this.db
      .select()
      .from(schema.orgs)
      .where(eq(schema.orgs.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<Org | null> {
    const [row] = await this.db
      .select()
      .from(schema.orgs)
      .where(eq(schema.orgs.slug, slug.toLowerCase()))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByLegalName(legalName: string): Promise<Org | null> {
    // Case-insensitive match (the unique partial index in migration
    // 0040 is on LOWER(legal_name) WHERE deleted_at IS NULL).
    const [row] = await this.db
      .select()
      .from(schema.orgs)
      .where(
        and(
          sql`LOWER(${schema.orgs.legalName}) = LOWER(${legalName})`,
          sql`${schema.orgs.deletedAt} IS NULL`
        )
      )
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListOrgsQuery): Promise<Page<Org>> {
    const cs = [];
    if (q.status) cs.push(eq(schema.orgs.status, q.status));
    if (q.countryCode) cs.push(eq(schema.orgs.countryCode, q.countryCode));
    if (q.orgType) cs.push(eq(schema.orgs.orgType, q.orgType));
    if (q.search) {
      const like = `%${q.search}%`;
      cs.push(
        or(
          ilike(schema.orgs.slug, like),
          ilike(schema.orgs.displayName, like),
          ilike(schema.orgs.legalName, like)
        )!
      );
    }
    if (q.cursor) cs.push(gt(schema.orgs.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.orgs)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(schema.orgs.id)
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(o: Org): Promise<void> {
    const x = o.toSnapshot();
    await this.db.insert(schema.orgs).values({
      id: x.id,
      slug: x.slug,
      legalName: x.legalName,
      displayName: x.displayName,
      orgType: x.orgType,
      countryCode: x.countryCode,
      defaultLocale: x.defaultLocale,
      defaultCurrency: x.defaultCurrency,
      defaultTimezone: x.defaultTimezone,
      status: x.status,
      branding: x.branding,
      metadata: x.metadata
    });
  }

  async save(o: Org): Promise<void> {
    const x = o.toSnapshot();
    await this.db
      .update(schema.orgs)
      .set({
        legalName: x.legalName,
        displayName: x.displayName,
        countryCode: x.countryCode,
        defaultLocale: x.defaultLocale,
        defaultCurrency: x.defaultCurrency,
        defaultTimezone: x.defaultTimezone,
        status: x.status,
        branding: x.branding,
        metadata: x.metadata,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.orgs.id, x.id));
  }

  private toDomain(r: typeof schema.orgs.$inferSelect): Org {
    return Org.rehydrate({
      id: r.id,
      slug: r.slug,
      legalName: r.legalName,
      displayName: r.displayName,
      orgType: r.orgType as never,
      countryCode: r.countryCode,
      defaultLocale: r.defaultLocale,
      defaultCurrency: r.defaultCurrency,
      defaultTimezone: r.defaultTimezone,
      status: r.status as never,
      branding: r.branding as Record<string, unknown>,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  }
}
