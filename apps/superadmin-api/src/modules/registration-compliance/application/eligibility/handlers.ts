import type { UserScope } from "../../../../shared/auth/scope";
import { Inject, Injectable } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { NotificationService } from "../../../communications/application/notification.service";
import { complianceRecipients } from "../compliance-recipients";
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
  /** Scoped admins: only records of seasons inside their scope. */
  visibleTo?: UserScope;
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
  checkType?: string;
}

@Injectable()
export class WaiveEligibilityHandler
  implements CommandHandler<WaiveEligibilityInput, EligibilityRecordDto>
{
  private readonly log = new Logger("WaiveEligibility");
  constructor(
    @Inject(ELIGIBILITY_RECORD_REPOSITORY)
    private readonly records: EligibilityRecordRepository,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}
  async execute(input: WaiveEligibilityInput): Promise<EligibilityRecordDto> {
    const rec = await this.records.findById(EligibilityRecordId.of(input.id));
    if (!rec) throw new NotFoundError("EligibilityRecord", input.id);
    rec.waive(input.reason, input.byUserId, input.checkType);
    await this.records.save(rec);
    const fresh = await this.records.findById(EligibilityRecordId.of(input.id));
    if (fresh?.status !== "waived") {
      throw new Error(`eligibility ${input.id}: readback after waive shows ${fresh?.status ?? "no row"}`);
    }
    await this.notifyWaived(fresh, input);
    return EligibilityRecordDto.fromDomain(fresh);
  }

  /**
   * UC-05 / UC-29: the player and the player's captains hear about the
   * decision (COMP-7). Captains get no reason; that stays between the
   * admin and the player.
   */
  private async notifyWaived(rec: EligibilityRecord, input: WaiveEligibilityInput): Promise<void> {
    const [person] = await this.db
      .select({
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        preferred: schema.persons.preferredName
      })
      .from(schema.persons)
      .where(eq(schema.persons.id, rec.personId))
      .limit(1);
    const [season] = rec.seasonId
      ? await this.db
          .select({ orgId: schema.seasons.orgId, name: schema.seasons.name })
          .from(schema.seasons)
          .where(eq(schema.seasons.id, rec.seasonId))
          .limit(1)
      : [];
    const personName =
      person?.preferred?.trim() || [person?.first, person?.last].filter(Boolean).join(" ").trim() || "The player";
    const checkLabel = input.checkType
      ? input.checkType.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase()
      : "eligibility";
    const forLabel = season?.name ?? "your league";
    const orgId = season?.orgId ?? null;
    const key = `${rec.id.value}:${Date.now()}`;
    const { direct, captains } = await complianceRecipients(this.db, {
      personId: rec.personId,
      actingUserId: null,
      seasonId: rec.seasonId
    });
    const jobs = [
      ...direct.map((d) =>
        this.notify.queue({
          orgId,
          templateCode: "eligibility.waived",
          channel: d.email ? "email" : "in_app",
          idempotencyKey: `eligibility.waived:${key}:${d.personId}`,
          recipientPersonId: d.personId,
          recipientEmail: d.email,
          payload: { personName, checkLabel, forLabel, reason: input.reason, seasonId: rec.seasonId, eligibilityId: rec.id.value },
          sourceEvent: "eligibility.waived"
        })
      ),
      ...captains.map((c) =>
        this.notify.queue({
          orgId,
          templateCode: "eligibility.waived.captain",
          channel: c.email ? "email" : "in_app",
          idempotencyKey: `eligibility.waived.captain:${key}:${c.personId}`,
          recipientPersonId: c.personId,
          recipientEmail: c.email,
          payload: { personName, checkLabel, forLabel, teamName: c.teamName, seasonId: rec.seasonId, eligibilityId: rec.id.value },
          sourceEvent: "eligibility.waived.captain"
        })
      )
    ];
    const queued = (await Promise.all(jobs)).filter(Boolean).length;
    this.log.log(`eligibility.waived id=${rec.id.value} person=${rec.personId} recipients=${jobs.length} queued=${queued}`);
    if (queued < jobs.length) this.log.warn(`eligibility.waived id=${rec.id.value}: ${jobs.length - queued} notice(s) not queued`);
  }
}
