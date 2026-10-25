import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  ConflictError,
  NotFoundError,
  SUSPENSION_IN_FORCE_STATUSES,
  ValidationError,
  clampLimit,
  describeSuspension,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  SUSPENSION_REPOSITORY,
  type SuspensionRepository
} from "../../domain/repositories/suspension.repository";
import { SuspensionId } from "../../domain/identifiers";
import { Suspension } from "../../domain/entities/suspension.entity";
import {
  type SuspensionKind,
  assertSuspensionKind
} from "../../domain/value-objects/game-status.vo";
import { rowToSuspension } from "../../infrastructure/repositories/drizzle-suspension.repository";
import { SuspensionDto, SuspensionPageDto } from "../dtos/game.dto";
import { NotificationService } from "../../../communications/application/notification.service";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../../shared/display/entity-names";

const log = new Logger("SuspensionCommands");

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ListSuspensionsInput {
  limit?: number;
  cursor?: string;
  personId?: string;
  status?: string;
  /** Suspensions issued from a penalty in this game. */
  gameId?: string;
  /** SQL subquery of person ids the caller may see; null = unrestricted. */
  visiblePersonIds?: SQL | null;
}

/** Newest first. Cursor = "<startAt ISO>|<id>" of the last row. */
@Injectable()
export class ListSuspensionsHandler
  implements QueryHandler<ListSuspensionsInput, SuspensionPageDto>
{
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async execute(input: ListSuspensionsInput): Promise<SuspensionPageDto> {
    const limit = clampLimit(input.limit);
    const s = schema.suspensions;
    const where: SQL[] = [];
    if (input.personId) where.push(eq(s.personId, input.personId));
    if (input.status) where.push(eq(s.status, input.status));
    if (input.gameId) {
      where.push(
        sql`${s.sourceEventId} in (select ge.id from game_events ge where ge.game_id = ${input.gameId}::uuid)`
      );
    }
    if (input.visiblePersonIds) where.push(sql`${s.personId} in ${input.visiblePersonIds}`);
    if (input.cursor) {
      const [iso, id] = input.cursor.split("|");
      const at = iso ? new Date(iso) : null;
      if (!at || Number.isNaN(at.getTime()) || !id) throw new ValidationError("Bad cursor.");
      where.push(or(lt(s.startAt, at), and(eq(s.startAt, at), lt(s.id, id)))!);
    }
    const rows = await this.db
      .select({ s, sourceGameId: schema.gameEvents.gameId })
      .from(s)
      .leftJoin(schema.gameEvents, eq(schema.gameEvents.id, s.sourceEventId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(s.startAt), desc(s.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const names = await resolveEntityNames(
      this.db,
      page.map((r) => ({ type: "person", id: r.s.personId }))
    );
    const last = page[page.length - 1];
    return {
      items: page.map((r) =>
        SuspensionDto.fromDomain(rowToSuspension(r.s), {
          personName: names.get(`person:${r.s.personId}`) ?? null,
          sourceGameId: r.sourceGameId ?? null
        })
      ),
      nextCursor: rows.length > limit && last ? `${last.s.startAt.toISOString()}|${last.s.id}` : null
    };
  }
}

export interface IssueSuspensionInput {
  personId: string;
  kind: SuspensionKind;
  sourceEventId?: string | null;
  nGames?: number | null;
  nDays?: number | null;
  /** time_bounded: ISO instant the player may play again. */
  endAt?: string | null;
  reason?: string | null;
  issuedByUserId?: string | null;
}

/** How long an identical issue counts as a repeated click (no idempotency column yet). */
const DUPLICATE_WINDOW_MS = 2 * 60_000;

async function lockPerson(tx: Tx, personId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`suspension:person:${personId}`}))`);
}

export async function personContact(
  db: Database,
  personId: string
): Promise<{ name: string; email: string | null }> {
  const [row] = await db
    .select({
      first: schema.persons.legalFirstName,
      last: schema.persons.legalLastName,
      preferred: schema.persons.preferredName,
      email: schema.profiles.email
    })
    .from(schema.persons)
    .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
    .where(eq(schema.persons.id, personId))
    .limit(1);
  return {
    name: row ? (row.preferred ?? `${row.first} ${row.last}`.trim()) : "there",
    email: row?.email ?? null
  };
}

@Injectable()
export class IssueSuspensionHandler
  implements CommandHandler<IssueSuspensionInput, SuspensionDto>
{
  constructor(
    @Inject(SUSPENSION_REPOSITORY)
    private readonly suspensions: SuspensionRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  async execute(input: IssueSuspensionInput): Promise<SuspensionDto> {
    const endAt = input.endAt ? new Date(input.endAt) : null;
    if (input.endAt && (!endAt || Number.isNaN(endAt.getTime()))) {
      throw new ValidationError("Pick the date the player may play again.");
    }
    // Validates kind, counts, end date and reason (kernel rule).
    const s = Suspension.create({
      id: SuspensionId.of(randomUUID()),
      personId: input.personId,
      kind: assertSuspensionKind(input.kind),
      sourceEventId: input.sourceEventId,
      nGames: input.nGames,
      nDays: input.nDays,
      endAt,
      reason: input.reason,
      issuedByUserId: input.issuedByUserId
    });
    const x = s.toSnapshot();

    let sourceGameId: string | null = null;
    if (x.sourceEventId) {
      const [ev] = await this.db
        .select({
          gameId: schema.gameEvents.gameId,
          eventType: schema.gameEvents.eventType,
          primaryPersonId: schema.gameEvents.primaryPersonId
        })
        .from(schema.gameEvents)
        .where(eq(schema.gameEvents.id, x.sourceEventId))
        .limit(1);
      if (!ev) throw new NotFoundError("Game event", x.sourceEventId);
      if (ev.eventType !== "penalty") {
        throw new ValidationError("A suspension can only come from a penalty.");
      }
      if (ev.primaryPersonId !== x.personId) {
        throw new ValidationError("That penalty was taken by a different player.");
      }
      sourceGameId = ev.gameId;
    }

    const inserted = await this.db.transaction(async (tx) => {
      // One issue per person at a time, so the duplicate checks below hold.
      await lockPerson(tx, x.personId);
      if (x.sourceEventId) {
        const [existing] = await tx
          .select({ id: schema.suspensions.id, status: schema.suspensions.status })
          .from(schema.suspensions)
          .where(
            and(
              eq(schema.suspensions.sourceEventId, x.sourceEventId),
              inArray(schema.suspensions.status, [...SUSPENSION_IN_FORCE_STATUSES, "served"])
            )
          )
          .limit(1);
        if (existing) {
          throw new ConflictError(
            `This penalty already has a suspension (${existing.status}). Lift it first to issue a different one.`
          );
        }
      } else {
        const [dupe] = await tx
          .select({ id: schema.suspensions.id })
          .from(schema.suspensions)
          .where(
            and(
              eq(schema.suspensions.personId, x.personId),
              isNull(schema.suspensions.sourceEventId),
              eq(schema.suspensions.kind, x.kind),
              eq(schema.suspensions.reason, x.reason ?? ""),
              x.nGames === null ? isNull(schema.suspensions.nGames) : eq(schema.suspensions.nGames, x.nGames),
              inArray(schema.suspensions.status, [...SUSPENSION_IN_FORCE_STATUSES]),
              gt(schema.suspensions.createdAt, new Date(Date.now() - DUPLICATE_WINDOW_MS))
            )
          )
          .limit(1);
        if (dupe) {
          throw new ConflictError(
            "The same suspension was issued for this player a moment ago. Reload to see it."
          );
        }
      }
      const rows = await tx
        .insert(schema.suspensions)
        .values({
          id: x.id,
          personId: x.personId,
          sourceEventId: x.sourceEventId,
          kind: x.kind,
          nGames: x.nGames,
          nDays: x.nDays,
          servedCount: 0,
          status: x.status,
          reason: x.reason,
          startAt: x.startAt,
          endAt: x.endAt,
          issuedByUserId: x.issuedByUserId
        })
        .returning({ id: schema.suspensions.id });
      if (rows.length !== 1) throw new Error(`suspension insert wrote ${rows.length} rows`);
      return rows.length;
    });

    const saved = await this.suspensions.findById(SuspensionId.of(x.id));
    if (!saved || saved.status !== "active") {
      throw new Error(`suspension ${x.id}: readback after issue failed`);
    }
    log.log(
      `issue suspension=${x.id} person=${x.personId} kind=${x.kind} nGames=${x.nGames ?? "-"} endAt=${x.endAt?.toISOString() ?? "-"} source=${x.sourceEventId ?? "-"} by=${x.issuedByUserId ?? "-"} rows=${inserted}`
    );

    const who = await personContact(this.db, x.personId);
    const summary = describeSuspension(x, new Date());
    await this.notify.queue({
      templateCode: "suspension.issued",
      channel: who.email ? "email" : "in_app",
      idempotencyKey: `suspension.issued:${x.id}`,
      recipientPersonId: x.personId,
      recipientEmail: who.email,
      payload: {
        personName: who.name,
        kind: "league",
        reason: x.reason ?? "",
        nGamesClause:
          x.kind === "n_games"
            ? ` for ${x.nGames} game${x.nGames === 1 ? "" : "s"}`
            : x.kind === "indefinite"
              ? " until it is lifted"
              : ` ${summary.replace(/^Until/, "until")}`
      },
      sourceEvent: "suspension.issued"
    });

    const names = await resolveEntityNames(this.db, [{ type: "person", id: saved.personId }]);
    return SuspensionDto.fromDomain(saved, {
      personName: names.get(`person:${saved.personId}`) ?? null,
      sourceGameId
    });
  }
}

/** Lock and load one suspension inside a transaction. */
async function lockSuspension(tx: Tx, id: string): Promise<Suspension> {
  const [row] = await tx
    .select()
    .from(schema.suspensions)
    .where(eq(schema.suspensions.id, id))
    .for("update");
  if (!row) throw new NotFoundError("Suspension", id);
  return rowToSuspension(row);
}

/** Write status / count / reason / end back only if the row still has `expected` status and count. */
async function saveIf(tx: Tx, s: Suspension, expected: { status: string; servedCount: number }): Promise<void> {
  const x = s.toSnapshot();
  const rows = await tx
    .update(schema.suspensions)
    .set({
      status: x.status,
      servedCount: x.servedCount,
      kind: x.kind,
      nGames: x.nGames,
      reason: x.reason,
      endAt: x.endAt,
      updatedAt: sql`now()`
    })
    .where(
      and(
        eq(schema.suspensions.id, x.id),
        eq(schema.suspensions.status, expected.status),
        eq(schema.suspensions.servedCount, expected.servedCount)
      )
    )
    .returning({ id: schema.suspensions.id });
  if (rows.length !== 1) {
    log.warn(`suspension ${x.id}: expected ${expected.status}/${expected.servedCount}, update touched ${rows.length} rows`);
    throw new ConflictError("This suspension changed while you were working on it. Reload and try again.");
  }
}

@Injectable()
export class LiftSuspensionHandler
  implements CommandHandler<{ id: string; reason: string; byUserId: string }, SuspensionDto>
{
  constructor(
    @Inject(SUSPENSION_REPOSITORY)
    private readonly suspensions: SuspensionRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  async execute(input: { id: string; reason: string; byUserId: string }): Promise<SuspensionDto> {
    const liftedAt = await this.db.transaction(async (tx) => {
      const s = await lockSuspension(tx, input.id);
      const expected = { status: s.status, servedCount: s.servedCount };
      s.lift(input.reason);
      await saveIf(tx, s, expected);
      return s.endAt;
    });
    const saved = await this.suspensions.findById(SuspensionId.of(input.id));
    if (!saved || saved.status !== "lifted") {
      throw new Error(`suspension ${input.id}: readback after lift is not lifted`);
    }
    log.log(`lift suspension=${input.id} person=${saved.personId} by=${input.byUserId} rows=1`);

    const who = await personContact(this.db, saved.personId);
    await this.notify.queue({
      templateCode: "suspension.lifted",
      channel: who.email ? "email" : "in_app",
      idempotencyKey: `suspension.lifted:${input.id}:${liftedAt?.toISOString() ?? ""}`,
      recipientPersonId: saved.personId,
      recipientEmail: who.email,
      payload: { personName: who.name, reason: input.reason.trim() },
      sourceEvent: "suspension.lifted"
    });

    const names = await resolveEntityNames(this.db, [{ type: "person", id: saved.personId }]);
    return SuspensionDto.fromDomain(saved, { personName: names.get(`person:${saved.personId}`) ?? null });
  }
}

/** Admin override: reduce or extend to a number of games (UC-14, COMP-11). */
@Injectable()
export class ChangeSuspensionGamesHandler
  implements CommandHandler<{ id: string; nGames: number; reason: string; byUserId: string }, SuspensionDto>
{
  constructor(
    @Inject(SUSPENSION_REPOSITORY)
    private readonly suspensions: SuspensionRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  async execute(input: { id: string; nGames: number; reason: string; byUserId: string }): Promise<SuspensionDto> {
    await this.db.transaction(async (tx) => {
      const s = await lockSuspension(tx, input.id);
      const expected = { status: s.status, servedCount: s.servedCount };
      s.changeGames(input.nGames, input.reason);
      await saveIf(tx, s, expected);
    });
    const saved = await this.suspensions.findById(SuspensionId.of(input.id));
    if (!saved || saved.kind !== "n_games" || saved.nGames !== input.nGames) {
      throw new Error(`suspension ${input.id}: readback after change does not show ${input.nGames} games`);
    }
    log.log(`change suspension=${input.id} person=${saved.personId} nGames=${input.nGames} status=${saved.status} by=${input.byUserId}`);

    const who = await personContact(this.db, saved.personId);
    const left = Math.max(0, input.nGames - saved.servedCount);
    await this.notify.queue({
      templateCode: "suspension.changed",
      channel: who.email ? "email" : "in_app",
      idempotencyKey: `suspension.changed:${input.id}:${saved.updatedAt.toISOString()}`,
      recipientPersonId: saved.personId,
      recipientEmail: who.email,
      payload: {
        suspensionId: input.id,
        personName: who.name,
        nGamesLabel: `${input.nGames} game${input.nGames === 1 ? "" : "s"}`,
        leftClause: saved.status === "served" ? "It is now fully served." : `${left} game${left === 1 ? "" : "s"} left to sit out.`,
        reason: input.reason.trim()
      },
      sourceEvent: "suspension.changed"
    });

    const names = await resolveEntityNames(this.db, [{ type: "person", id: saved.personId }]);
    return SuspensionDto.fromDomain(saved, { personName: names.get(`person:${saved.personId}`) ?? null });
  }
}

@Injectable()
export class ServeSuspensionHandler
  implements CommandHandler<{ id: string; byUserId: string }, SuspensionDto>
{
  constructor(
    @Inject(SUSPENSION_REPOSITORY)
    private readonly suspensions: SuspensionRepository,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}
  async execute(input: { id: string; byUserId: string }): Promise<SuspensionDto> {
    await this.db.transaction(async (tx) => {
      const s = await lockSuspension(tx, input.id);
      const expected = { status: s.status, servedCount: s.servedCount };
      s.serveOneGame();
      await saveIf(tx, s, expected);
    });
    const saved = await this.suspensions.findById(SuspensionId.of(input.id));
    if (!saved) throw new Error(`suspension ${input.id}: readback after serve failed`);
    log.log(
      `serve (manual) suspension=${input.id} by=${input.byUserId} served=${saved.servedCount} status=${saved.status} rows=1`
    );
    return SuspensionDto.fromDomain(saved);
  }
}
