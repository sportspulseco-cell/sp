import { Inject, Injectable } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NotFoundError } from "@sportspulse/kernel";
import {
  GAME_OFFICIAL_REPOSITORY,
  type AssignOfficialInput,
  type GameOfficialRepository,
  type GameOfficialRow,
  type UpdateOfficialStatusInput
} from "../../domain/repositories/game-official.repository";

export class GameOfficialDto {
  @ApiProperty() id!: string;
  @ApiProperty() gameId!: string;
  @ApiProperty() personId!: string;
  @ApiProperty() role!: string;
  @ApiPropertyOptional({ nullable: true }) slot!: string | null;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true }) assignedByUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) notes!: string | null;
  @ApiPropertyOptional({ nullable: true }) revokedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromRow(r: GameOfficialRow): GameOfficialDto {
    return {
      id: r.id,
      gameId: r.gameId,
      personId: r.personId,
      role: r.role,
      slot: r.slot,
      status: r.status,
      assignedByUserId: r.assignedByUserId,
      notes: r.notes,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
}

@Injectable()
export class ListGameOfficialsHandler {
  constructor(
    @Inject(GAME_OFFICIAL_REPOSITORY)
    private readonly repo: GameOfficialRepository
  ) {}
  async execute({ gameId }: { gameId: string }): Promise<GameOfficialDto[]> {
    const rows = await this.repo.listForGame(gameId);
    return rows.map((r) => GameOfficialDto.fromRow(r));
  }
}

@Injectable()
export class ListPersonOfficialAssignmentsHandler {
  constructor(
    @Inject(GAME_OFFICIAL_REPOSITORY)
    private readonly repo: GameOfficialRepository
  ) {}
  async execute({ personId }: { personId: string }): Promise<GameOfficialDto[]> {
    const rows = await this.repo.listForPerson(personId);
    return rows.map((r) => GameOfficialDto.fromRow(r));
  }
}

@Injectable()
export class AssignGameOfficialHandler {
  constructor(
    @Inject(GAME_OFFICIAL_REPOSITORY)
    private readonly repo: GameOfficialRepository
  ) {}
  async execute(input: AssignOfficialInput): Promise<GameOfficialDto> {
    const row = await this.repo.assign(input);
    return GameOfficialDto.fromRow(row);
  }
}

@Injectable()
export class UpdateOfficialStatusHandler {
  constructor(
    @Inject(GAME_OFFICIAL_REPOSITORY)
    private readonly repo: GameOfficialRepository
  ) {}
  async execute(input: UpdateOfficialStatusInput): Promise<GameOfficialDto> {
    const existing = await this.repo.findById(input.id);
    if (!existing) throw new NotFoundError("GameOfficial", input.id);
    const row = await this.repo.updateStatus(input);
    return GameOfficialDto.fromRow(row);
  }
}

@Injectable()
export class RevokeGameOfficialHandler {
  constructor(
    @Inject(GAME_OFFICIAL_REPOSITORY)
    private readonly repo: GameOfficialRepository
  ) {}
  async execute({ id }: { id: string }): Promise<GameOfficialDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError("GameOfficial", id);
    const row = await this.repo.revoke(id);
    return GameOfficialDto.fromRow(row);
  }
}
