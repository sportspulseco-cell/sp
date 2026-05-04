import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  ELIGIBILITY_RECORD_REPOSITORY,
  type EligibilityRecordRepository
} from "../../domain/repositories/eligibility-record.repository";
import { EligibilityRecordId } from "../../domain/identifiers";
import { EligibilityRecord } from "../../domain/entities/eligibility-record.entity";
import {
  type EligibilityStatus,
  assertEligibilityStatus
} from "../../domain/value-objects/statuses.vo";
import {
  EligibilityRecordDto,
  EligibilityRecordPageDto
} from "../dtos/registration.dto";

export interface ListEligibilityInput {
  limit?: number;
  cursor?: string;
  personId?: string;
  seasonId?: string;
  governingBodyId?: string;
  status?: string;
}

@Injectable()
export class ListEligibilityHandler
  implements QueryHandler<ListEligibilityInput, EligibilityRecordPageDto>
{
  constructor(
    @Inject(ELIGIBILITY_RECORD_REPOSITORY)
    private readonly records: EligibilityRecordRepository
  ) {}
  async execute(input: ListEligibilityInput): Promise<EligibilityRecordPageDto> {
    const page = await this.records.list({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(EligibilityRecordDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetEligibilityHandler
  implements QueryHandler<{ id: string }, EligibilityRecordDto>
{
  constructor(
    @Inject(ELIGIBILITY_RECORD_REPOSITORY)
    private readonly records: EligibilityRecordRepository
  ) {}
  async execute(input: { id: string }): Promise<EligibilityRecordDto> {
    const r = await this.records.findById(EligibilityRecordId.of(input.id));
    if (!r) throw new NotFoundError("EligibilityRecord", input.id);
    return EligibilityRecordDto.fromDomain(r);
  }
}

export interface UpsertEligibilityInput {
  personId: string;
  seasonId?: string | null;
  governingBodyId?: string | null;
  ruleEvaluation?: Record<string, unknown>;
  status?: EligibilityStatus;
  evaluatedByUserId?: string | null;
}

@Injectable()
export class CreateEligibilityHandler
  implements CommandHandler<UpsertEligibilityInput, EligibilityRecordDto>
{
  constructor(
    @Inject(ELIGIBILITY_RECORD_REPOSITORY)
    private readonly records: EligibilityRecordRepository
  ) {}
  async execute(input: UpsertEligibilityInput): Promise<EligibilityRecordDto> {
    const rec = EligibilityRecord.create({
      id: EligibilityRecordId.of(randomUUID()),
      personId: input.personId,
      seasonId: input.seasonId,
      governingBodyId: input.governingBodyId,
      ruleEvaluation: input.ruleEvaluation,
      status: input.status,
      evaluatedByUserId: input.evaluatedByUserId
    });
    await this.records.insert(rec);
    return EligibilityRecordDto.fromDomain(rec);
  }
}

export interface ReevaluateEligibilityInput {
  id: string;
  ruleEvaluation: Record<string, unknown>;
  status: string;
  evaluatedByUserId: string;
}

@Injectable()
export class ReevaluateEligibilityHandler
  implements CommandHandler<ReevaluateEligibilityInput, EligibilityRecordDto>
{
  constructor(
    @Inject(ELIGIBILITY_RECORD_REPOSITORY)
    private readonly records: EligibilityRecordRepository
  ) {}
  async execute(input: ReevaluateEligibilityInput): Promise<EligibilityRecordDto> {
    const rec = await this.records.findById(EligibilityRecordId.of(input.id));
    if (!rec) throw new NotFoundError("EligibilityRecord", input.id);
    rec.setEvaluation(
      input.ruleEvaluation,
      assertEligibilityStatus(input.status),
      input.evaluatedByUserId
    );
    await this.records.save(rec);
    return EligibilityRecordDto.fromDomain(rec);
  }
}

export interface WaiveEligibilityInput {
  id: string;
  reason: string;
  byUserId: string;
}

@Injectable()
export class WaiveEligibilityHandler
  implements CommandHandler<WaiveEligibilityInput, EligibilityRecordDto>
{
  constructor(
    @Inject(ELIGIBILITY_RECORD_REPOSITORY)
    private readonly records: EligibilityRecordRepository
  ) {}
  async execute(input: WaiveEligibilityInput): Promise<EligibilityRecordDto> {
    const rec = await this.records.findById(EligibilityRecordId.of(input.id));
    if (!rec) throw new NotFoundError("EligibilityRecord", input.id);
    rec.waive(input.reason, input.byUserId);
    await this.records.save(rec);
    return EligibilityRecordDto.fromDomain(rec);
  }
}
