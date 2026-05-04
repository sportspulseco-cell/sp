import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gt, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { Person, PersonId } from "../../domain/entities/person.entity";
import type {
  ListPersonsQuery,
  PersonRepository
} from "../../domain/repositories/person.repository";

@Injectable()
export class DrizzlePersonRepository implements PersonRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findById(id: PersonId): Promise<Person | null> {
    const [row] = await this.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, id.value))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async list(q: ListPersonsQuery): Promise<Page<Person>> {
    const cs = [];
    if (q.countryCode) cs.push(eq(schema.persons.countryCode, q.countryCode));
    if (q.hasUserAccount === true)
      cs.push(isNotNull(schema.persons.userId));
    if (q.hasUserAccount === false) cs.push(isNull(schema.persons.userId));
    if (q.search) {
      const like = `%${q.search}%`;
      cs.push(
        or(
          ilike(schema.persons.legalFirstName, like),
          ilike(schema.persons.legalLastName, like),
          ilike(schema.persons.preferredName, like)
        )!
      );
    }
    if (q.cursor) cs.push(gt(schema.persons.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.persons)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.persons.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toDomain(r)
    );
    const nextCursor = hasMore ? rows[q.limit - 1]!.id : null;
    return { items, nextCursor };
  }

  async insert(p: Person): Promise<void> {
    const x = p.toSnapshot();
    await this.db.insert(schema.persons).values({
      id: x.id,
      userId: x.userId,
      legalFirstName: x.legalFirstName,
      legalLastName: x.legalLastName,
      preferredName: x.preferredName,
      dobDate: x.dobDate,
      genderSelfId: x.genderSelfId,
      pronouns: x.pronouns,
      countryCode: x.countryCode,
      photoUrl: x.photoUrl,
      externalIds: x.externalIds
    });
  }

  async save(p: Person): Promise<void> {
    const x = p.toSnapshot();
    await this.db
      .update(schema.persons)
      .set({
        userId: x.userId,
        legalFirstName: x.legalFirstName,
        legalLastName: x.legalLastName,
        preferredName: x.preferredName,
        dobDate: x.dobDate,
        genderSelfId: x.genderSelfId,
        pronouns: x.pronouns,
        countryCode: x.countryCode,
        photoUrl: x.photoUrl,
        externalIds: x.externalIds,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.persons.id, x.id));
  }

  private toDomain(r: typeof schema.persons.$inferSelect): Person {
    return Person.rehydrate({
      id: r.id,
      userId: r.userId,
      legalFirstName: r.legalFirstName,
      legalLastName: r.legalLastName,
      preferredName: r.preferredName,
      dobDate: r.dobDate as unknown as string | null,
      genderSelfId: r.genderSelfId,
      pronouns: r.pronouns,
      countryCode: r.countryCode,
      photoUrl: r.photoUrl,
      externalIds: r.externalIds as Record<string, unknown>,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    });
  }
}
