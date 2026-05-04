import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  ConflictError,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  ROSTER_MOVE_REPOSITORY,
  type RosterMoveRepository
} from "../../domain/repositories/roster-move.repository";
import {
  TEAM_MEMBERSHIP_REPOSITORY,
  type TeamMembershipRepository
} from "../../domain/repositories/team-membership.repository";
import { RosterMoveId } from "../../domain/identifiers";
import { RosterMove } from "../../domain/entities/roster-move.entity";
import {
  type MembershipType,
  type MoveType,
  isAddingMove,
  isTerminatingMove
} from "../../domain/value-objects/move-type.vo";
import { RosterMoveDto, RosterMovePageDto } from "../dtos/roster.dto";

interface BaseMoveInput {
  teamId: string;
  personId: string;
  seasonId: string;
  effectiveAt?: string;
  jerseyNumber?: number | null;
  positionCode?: string | null;
  membershipType?: MembershipType;
  reason?: string | null;
  sourceEventId?: string | null;
  createdByUserId?: string | null;
}

// Shared logic: append a move + apply to the projection.
async function applyMove(
  moves: RosterMoveRepository,
  memberships: TeamMembershipRepository,
  input: BaseMoveInput,
  moveType: MoveType,
  closeStatus?: string
): Promise<RosterMove> {
  // Idempotency
  if (input.sourceEventId) {
    const existing = await moves.findBySourceEventId(input.sourceEventId);
    if (existing) return existing;
  }

  const at = input.effectiveAt ? new Date(input.effectiveAt) : new Date();

  // Domain rules for ADD-style moves
  if (isAddingMove(moveType)) {
    const active = await memberships.findActive(
      input.teamId,
      input.personId,
      input.seasonId
    );
    if (active) {
      throw new ConflictError(
        "Person already has an active membership on this team for this season"
      );
    }
  }

  // Domain rules for TERMINATING moves
  if (isTerminatingMove(moveType)) {
    const active = await memberships.findActive(
      input.teamId,
      input.personId,
      input.seasonId
    );
    if (!active) {
      throw new ConflictError(
        "No active membership exists to terminate"
      );
    }
  }

  const move = RosterMove.create({
    id: RosterMoveId.of(randomUUID()),
    teamId: input.teamId,
    personId: input.personId,
    seasonId: input.seasonId,
    moveType,
    membershipType: input.membershipType ?? "primary",
    effectiveAt: at,
    jerseyNumber: input.jerseyNumber,
    positionCode: input.positionCode,
    reason: input.reason,
    sourceEventId: input.sourceEventId,
    createdByUserId: input.createdByUserId
  });

  await moves.insert(move);

  // Project: open or close the membership
  if (isAddingMove(moveType)) {
    await memberships.open({
      teamId: move.teamId,
      personId: move.personId,
      seasonId: move.seasonId,
      membershipType: move.membershipType,
      jerseyNumber: move.jerseyNumber,
      positionCode: move.positionCode,
      effectiveFrom: move.effectiveAt,
      lastMoveId: move.id.value,
      currentStatus: "active"
    });
  } else if (isTerminatingMove(moveType)) {
    await memberships.close(
      move.teamId,
      move.personId,
      move.seasonId,
      move.effectiveAt,
      move.id.value,
      closeStatus ?? "released"
    );
  }

  return move;
}

// ---------- Queries ----------

export interface ListRosterMovesInput {
  limit?: number;
  cursor?: string;
  teamId?: string;
  personId?: string;
  seasonId?: string;
  moveType?: string;
}

@Injectable()
export class ListRosterMovesHandler
  implements QueryHandler<ListRosterMovesInput, RosterMovePageDto>
{
  constructor(
    @Inject(ROSTER_MOVE_REPOSITORY) private readonly moves: RosterMoveRepository
  ) {}
  async execute(input: ListRosterMovesInput): Promise<RosterMovePageDto> {
    const page = await this.moves.list({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(RosterMoveDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetRosterMoveHandler
  implements QueryHandler<{ id: string }, RosterMoveDto>
{
  constructor(
    @Inject(ROSTER_MOVE_REPOSITORY) private readonly moves: RosterMoveRepository
  ) {}
  async execute(input: { id: string }): Promise<RosterMoveDto> {
    const m = await this.moves.findById(RosterMoveId.of(input.id));
    if (!m) throw new NotFoundError("RosterMove", input.id);
    return RosterMoveDto.fromDomain(m);
  }
}

// ---------- Commands ----------

@Injectable()
export class AddPlayerHandler implements CommandHandler<BaseMoveInput, RosterMoveDto> {
  constructor(
    @Inject(ROSTER_MOVE_REPOSITORY) private readonly moves: RosterMoveRepository,
    @Inject(TEAM_MEMBERSHIP_REPOSITORY)
    private readonly memberships: TeamMembershipRepository
  ) {}
  async execute(input: BaseMoveInput): Promise<RosterMoveDto> {
    const m = await applyMove(this.moves, this.memberships, input, "add");
    return RosterMoveDto.fromDomain(m);
  }
}

@Injectable()
export class DropPlayerHandler implements CommandHandler<BaseMoveInput, RosterMoveDto> {
  constructor(
    @Inject(ROSTER_MOVE_REPOSITORY) private readonly moves: RosterMoveRepository,
    @Inject(TEAM_MEMBERSHIP_REPOSITORY)
    private readonly memberships: TeamMembershipRepository
  ) {}
  async execute(input: BaseMoveInput): Promise<RosterMoveDto> {
    const m = await applyMove(
      this.moves,
      this.memberships,
      input,
      "drop",
      "released"
    );
    return RosterMoveDto.fromDomain(m);
  }
}

export interface TradeInput {
  fromTeamId: string;
  toTeamId: string;
  personId: string;
  seasonId: string;
  effectiveAt?: string;
  jerseyNumber?: number | null;
  positionCode?: string | null;
  reason?: string | null;
  sourceEventId?: string | null;
  createdByUserId?: string | null;
}

@Injectable()
export class TradePlayerHandler
  implements CommandHandler<TradeInput, { tradeOut: RosterMoveDto; tradeIn: RosterMoveDto }>
{
  constructor(
    @Inject(ROSTER_MOVE_REPOSITORY) private readonly moves: RosterMoveRepository,
    @Inject(TEAM_MEMBERSHIP_REPOSITORY)
    private readonly memberships: TeamMembershipRepository
  ) {}
  async execute(input: TradeInput) {
    const out = await applyMove(
      this.moves,
      this.memberships,
      {
        teamId: input.fromTeamId,
        personId: input.personId,
        seasonId: input.seasonId,
        effectiveAt: input.effectiveAt,
        reason: input.reason,
        sourceEventId: input.sourceEventId
          ? `${input.sourceEventId}-out`
          : null,
        createdByUserId: input.createdByUserId
      },
      "trade_out",
      "released"
    );
    const inMove = await applyMove(
      this.moves,
      this.memberships,
      {
        teamId: input.toTeamId,
        personId: input.personId,
        seasonId: input.seasonId,
        effectiveAt: input.effectiveAt,
        jerseyNumber: input.jerseyNumber,
        positionCode: input.positionCode,
        reason: input.reason,
        sourceEventId: input.sourceEventId ? `${input.sourceEventId}-in` : null,
        createdByUserId: input.createdByUserId
      },
      "trade_in"
    );
    return {
      tradeOut: RosterMoveDto.fromDomain(out),
      tradeIn: RosterMoveDto.fromDomain(inMove)
    };
  }
}

@Injectable()
export class CallUpPlayerHandler
  implements CommandHandler<BaseMoveInput, RosterMoveDto>
{
  constructor(
    @Inject(ROSTER_MOVE_REPOSITORY) private readonly moves: RosterMoveRepository,
    @Inject(TEAM_MEMBERSHIP_REPOSITORY)
    private readonly memberships: TeamMembershipRepository
  ) {}
  async execute(input: BaseMoveInput): Promise<RosterMoveDto> {
    const m = await applyMove(
      this.moves,
      this.memberships,
      { ...input, membershipType: input.membershipType ?? "call_up" },
      "call_up"
    );
    return RosterMoveDto.fromDomain(m);
  }
}

@Injectable()
export class SendDownPlayerHandler
  implements CommandHandler<BaseMoveInput, RosterMoveDto>
{
  constructor(
    @Inject(ROSTER_MOVE_REPOSITORY) private readonly moves: RosterMoveRepository,
    @Inject(TEAM_MEMBERSHIP_REPOSITORY)
    private readonly memberships: TeamMembershipRepository
  ) {}
  async execute(input: BaseMoveInput): Promise<RosterMoveDto> {
    const m = await applyMove(
      this.moves,
      this.memberships,
      input,
      "send_down",
      "released"
    );
    return RosterMoveDto.fromDomain(m);
  }
}
