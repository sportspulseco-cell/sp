import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  NotFoundError,
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
import { SuspensionDto, SuspensionPageDto } from "../dtos/game.dto";
import { NotificationService } from "../../../communications/application/notification.service";

export interface ListSuspensionsInput {
  limit?: number;
  cursor?: string;
  personId?: string;
  status?: string;
}

@Injectable()
export class ListSuspensionsHandler
  implements QueryHandler<ListSuspensionsInput, SuspensionPageDto>
{
  constructor(
    @Inject(SUSPENSION_REPOSITORY)
    private readonly suspensions: SuspensionRepository
  ) {}
  async execute(input: ListSuspensionsInput): Promise<SuspensionPageDto> {
    const page = await this.suspensions.list({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(SuspensionDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

export interface IssueSuspensionInput {
  personId: string;
  kind: SuspensionKind;
  sourceEventId?: string | null;
  nGames?: number | null;
  nDays?: number | null;
  reason?: string | null;
  issuedByUserId?: string | null;
}

@Injectable()
export class IssueSuspensionHandler
  implements CommandHandler<IssueSuspensionInput, SuspensionDto>
{
  constructor(
    @Inject(SUSPENSION_REPOSITORY)
    private readonly suspensions: SuspensionRepository,
    private readonly notify: NotificationService
  ) {}
  async execute(input: IssueSuspensionInput): Promise<SuspensionDto> {
    const s = Suspension.create({
      id: SuspensionId.of(randomUUID()),
      personId: input.personId,
      kind: assertSuspensionKind(input.kind),
      sourceEventId: input.sourceEventId,
      nGames: input.nGames,
      nDays: input.nDays,
      reason: input.reason,
      issuedByUserId: input.issuedByUserId
    });
    await this.suspensions.insert(s);

    const x = s.toSnapshot();
    await this.notify.queue({
      templateCode: "suspension.issued",
      idempotencyKey: `suspension.issued:${x.id}`,
      recipientPersonId: x.personId,
      payload: {
        personName: "player",
        kind: x.kind.replace(/_/g, " "),
        reason: x.reason ?? "—",
        nGamesClause: x.nGames ? ` for ${x.nGames} game(s)` : ""
      },
      sourceEvent: "suspension.issued"
    });

    return SuspensionDto.fromDomain(s);
  }
}

@Injectable()
export class LiftSuspensionHandler
  implements CommandHandler<{ id: string; reason?: string }, SuspensionDto>
{
  constructor(
    @Inject(SUSPENSION_REPOSITORY)
    private readonly suspensions: SuspensionRepository,
    private readonly notify: NotificationService
  ) {}
  async execute(input: {
    id: string;
    reason?: string;
  }): Promise<SuspensionDto> {
    const s = await this.suspensions.findById(SuspensionId.of(input.id));
    if (!s) throw new NotFoundError("Suspension", input.id);
    s.lift(input.reason);
    await this.suspensions.save(s);

    const x = s.toSnapshot();
    await this.notify.queue({
      templateCode: "suspension.lifted",
      idempotencyKey: `suspension.lifted:${x.id}:${x.endAt?.toISOString() ?? ""}`,
      recipientPersonId: x.personId,
      payload: {
        personName: "player",
        reason: input.reason ?? "—"
      },
      sourceEvent: "suspension.lifted"
    });

    return SuspensionDto.fromDomain(s);
  }
}

@Injectable()
export class ServeSuspensionHandler
  implements CommandHandler<{ id: string }, SuspensionDto>
{
  constructor(
    @Inject(SUSPENSION_REPOSITORY)
    private readonly suspensions: SuspensionRepository
  ) {}
  async execute(input: { id: string }): Promise<SuspensionDto> {
    const s = await this.suspensions.findById(SuspensionId.of(input.id));
    if (!s) throw new NotFoundError("Suspension", input.id);
    s.serveOneGame();
    await this.suspensions.save(s);
    return SuspensionDto.fromDomain(s);
  }
}
