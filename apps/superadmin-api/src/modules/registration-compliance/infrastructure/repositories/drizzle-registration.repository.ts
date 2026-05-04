import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import {
  Registration,
  type RegistrationItem
} from "../../domain/entities/registration.entity";
import { RegistrationId } from "../../domain/identifiers";
import type {
  ListRegistrationsQuery,
  RegistrationRepository
} from "../../domain/repositories/registration.repository";

@Injectable()
export class DrizzleRegistrationRepository implements RegistrationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: RegistrationId): Promise<Registration | null> {
    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.id, id.value))
      .limit(1);
    if (!row) return null;
    const items = await this.loadItems(row.id);
    return Registration.rehydrate(this.toSnapshot(row, items));
  }

  async findByIdempotencyKey(key: string): Promise<Registration | null> {
    const [row] = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.idempotencyKey, key))
      .limit(1);
    if (!row) return null;
    const items = await this.loadItems(row.id);
    return Registration.rehydrate(this.toSnapshot(row, items));
  }

  async list(q: ListRegistrationsQuery): Promise<Page<Registration>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.registrations.orgId, q.orgId));
    if (q.status) cs.push(eq(schema.registrations.status, q.status));
    if (q.leagueId) cs.push(eq(schema.registrations.leagueId, q.leagueId));
    if (q.divisionId)
      cs.push(eq(schema.registrations.divisionId, q.divisionId));
    if (q.teamId) cs.push(eq(schema.registrations.teamId, q.teamId));
    if (q.subjectPersonId)
      cs.push(eq(schema.registrations.subjectPersonId, q.subjectPersonId));
    if (q.cursor) cs.push(gt(schema.registrations.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.registrations)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.registrations.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const sliced = hasMore ? rows.slice(0, q.limit) : rows;

    // Load items for the page (no item details in list view — keep it cheap)
    const items = sliced.map((r) =>
      Registration.rehydrate(this.toSnapshot(r, []))
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(reg: Registration): Promise<void> {
    const x = reg.toSnapshot();
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.registrations).values({
        id: x.id,
        idempotencyKey: x.idempotencyKey,
        orgId: x.orgId,
        formVersionId: x.formVersionId,
        submittedByUserId: x.submittedByUserId,
        subjectPersonId: x.subjectPersonId,
        status: x.status,
        leagueId: x.leagueId,
        divisionId: x.divisionId,
        teamId: x.teamId,
        submittedAt: x.submittedAt,
        reviewedByUserId: x.reviewedByUserId,
        reviewedAt: x.reviewedAt,
        decisionReason: x.decisionReason,
        metadata: x.metadata
      });
      if (x.items.length) {
        await tx.insert(schema.registrationItems).values(
          x.items.map((i) => ({
            registrationId: x.id,
            fieldKey: i.fieldKey,
            value: i.value,
            encrypted: i.encrypted
          }))
        );
      }
    });
  }

  async save(reg: Registration): Promise<void> {
    const x = reg.toSnapshot();
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.registrations)
        .set({
          status: x.status,
          leagueId: x.leagueId,
          divisionId: x.divisionId,
          teamId: x.teamId,
          submittedAt: x.submittedAt,
          reviewedByUserId: x.reviewedByUserId,
          reviewedAt: x.reviewedAt,
          decisionReason: x.decisionReason,
          metadata: x.metadata,
          updatedAt: sql`NOW()`
        })
        .where(eq(schema.registrations.id, x.id));
      // Replace items
      await tx
        .delete(schema.registrationItems)
        .where(eq(schema.registrationItems.registrationId, x.id));
      if (x.items.length) {
        await tx.insert(schema.registrationItems).values(
          x.items.map((i) => ({
            registrationId: x.id,
            fieldKey: i.fieldKey,
            value: i.value,
            encrypted: i.encrypted
          }))
        );
      }
    });
  }

  // ------- helpers -------

  private async loadItems(registrationId: string): Promise<RegistrationItem[]> {
    const rows = await this.db
      .select()
      .from(schema.registrationItems)
      .where(eq(schema.registrationItems.registrationId, registrationId));
    return rows.map((r) => ({
      fieldKey: r.fieldKey,
      value: r.value,
      encrypted: r.encrypted
    }));
  }

  private toSnapshot(
    r: typeof schema.registrations.$inferSelect,
    items: RegistrationItem[]
  ) {
    return {
      id: r.id,
      idempotencyKey: r.idempotencyKey,
      orgId: r.orgId,
      formVersionId: r.formVersionId,
      submittedByUserId: r.submittedByUserId,
      subjectPersonId: r.subjectPersonId,
      status: r.status as never,
      leagueId: r.leagueId,
      divisionId: r.divisionId,
      teamId: r.teamId,
      submittedAt: r.submittedAt,
      reviewedByUserId: r.reviewedByUserId,
      reviewedAt: r.reviewedAt,
      decisionReason: r.decisionReason,
      metadata: r.metadata as Record<string, unknown>,
      items,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }
}
