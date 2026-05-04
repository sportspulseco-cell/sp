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
  REGISTRATION_REPOSITORY,
  type RegistrationRepository
} from "../../domain/repositories/registration.repository";
import { RegistrationId } from "../../domain/identifiers";
import {
  Registration,
  type RegistrationItem
} from "../../domain/entities/registration.entity";
import { RegistrationDto, RegistrationPageDto } from "../dtos/registration.dto";
import { NotificationService } from "../../../communications/application/notification.service";
import type { TemplateCode } from "../../../communications/domain/templates/catalog";
import { FinanceService } from "../../../finance/application/finance.service";

export interface ListRegistrationsInput {
  limit?: number;
  cursor?: string;
  orgId?: string;
  status?: string;
  leagueId?: string;
  divisionId?: string;
  teamId?: string;
  subjectPersonId?: string;
}

@Injectable()
export class ListRegistrationsHandler
  implements QueryHandler<ListRegistrationsInput, RegistrationPageDto>
{
  constructor(
    @Inject(REGISTRATION_REPOSITORY)
    private readonly registrations: RegistrationRepository
  ) {}
  async execute(input: ListRegistrationsInput): Promise<RegistrationPageDto> {
    const page = await this.registrations.list({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(RegistrationDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetRegistrationHandler
  implements QueryHandler<{ id: string }, RegistrationDto>
{
  constructor(
    @Inject(REGISTRATION_REPOSITORY)
    private readonly registrations: RegistrationRepository
  ) {}
  async execute(input: { id: string }): Promise<RegistrationDto> {
    const r = await this.registrations.findById(RegistrationId.of(input.id));
    if (!r) throw new NotFoundError("Registration", input.id);
    return RegistrationDto.fromDomain(r);
  }
}

export interface CreateRegistrationInput {
  idempotencyKey: string;
  orgId: string;
  formVersionId: string;
  submittedByUserId?: string | null;
  subjectPersonId: string;
  leagueId?: string | null;
  divisionId?: string | null;
  teamId?: string | null;
  items?: RegistrationItem[];
}

@Injectable()
export class CreateRegistrationHandler
  implements CommandHandler<CreateRegistrationInput, RegistrationDto>
{
  constructor(
    @Inject(REGISTRATION_REPOSITORY)
    private readonly registrations: RegistrationRepository
  ) {}
  async execute(input: CreateRegistrationInput): Promise<RegistrationDto> {
    const existing = await this.registrations.findByIdempotencyKey(
      input.idempotencyKey
    );
    if (existing) {
      // Idempotency replay — return the same registration
      return RegistrationDto.fromDomain(existing);
    }
    const reg = Registration.create({
      id: RegistrationId.of(randomUUID()),
      ...input
    });
    await this.registrations.insert(reg);
    return RegistrationDto.fromDomain(reg);
  }
}

@Injectable()
export class SubmitRegistrationHandler
  implements CommandHandler<{ id: string }, RegistrationDto>
{
  constructor(
    @Inject(REGISTRATION_REPOSITORY)
    private readonly registrations: RegistrationRepository
  ) {}
  async execute(input: { id: string }): Promise<RegistrationDto> {
    const r = await this.registrations.findById(RegistrationId.of(input.id));
    if (!r) throw new NotFoundError("Registration", input.id);
    r.submit();
    await this.registrations.save(r);
    return RegistrationDto.fromDomain(r);
  }
}

export interface ReviewRegistrationInput {
  id: string;
  reviewerId: string;
  action: "approve" | "reject" | "waitlist" | "start_review";
  reason?: string;
}

@Injectable()
export class ReviewRegistrationHandler
  implements CommandHandler<ReviewRegistrationInput, RegistrationDto>
{
  constructor(
    @Inject(REGISTRATION_REPOSITORY)
    private readonly registrations: RegistrationRepository,
    private readonly notify: NotificationService,
    private readonly finance: FinanceService
  ) {}
  async execute(input: ReviewRegistrationInput): Promise<RegistrationDto> {
    const r = await this.registrations.findById(RegistrationId.of(input.id));
    if (!r) throw new NotFoundError("Registration", input.id);
    switch (input.action) {
      case "start_review":
        r.startReview(input.reviewerId);
        break;
      case "approve":
        r.approve(input.reviewerId, input.reason);
        break;
      case "reject":
        if (!input.reason)
          throw new ConflictError("Reject requires a reason");
        r.reject(input.reviewerId, input.reason);
        break;
      case "waitlist":
        r.waitlist(input.reviewerId, input.reason);
        break;
    }
    await this.registrations.save(r);

    const x = r.toSnapshot();
    const codeFor: Record<typeof input.action, TemplateCode | null> = {
      start_review: null,
      approve: "registration.approved",
      reject: "registration.rejected",
      waitlist: "registration.waitlisted"
    };
    const tplCode = codeFor[input.action];
    if (tplCode) {
      await this.notify.queue({
        orgId: x.orgId,
        templateCode: tplCode,
        idempotencyKey: `${tplCode}:${x.id}:${x.updatedAt.toISOString()}`,
        recipientPersonId: x.subjectPersonId,
        payload: {
          personName: "registrant",
          leagueName: x.leagueId ?? "your league",
          reason: input.reason ?? ""
        },
        sourceEvent: tplCode
      });
    }

    // On approval, spawn an invoice (idempotent on registrationId).
    if (input.action === "approve") {
      await this.finance.invoiceForRegistration({
        orgId: x.orgId,
        registrationId: x.id,
        recipientPersonId: x.subjectPersonId,
        feeSchedule: null,
        fallbackDescription: "Registration fee"
      });
    }

    return RegistrationDto.fromDomain(r);
  }
}

@Injectable()
export class WithdrawRegistrationHandler
  implements
    CommandHandler<{ id: string; reason?: string }, RegistrationDto>
{
  constructor(
    @Inject(REGISTRATION_REPOSITORY)
    private readonly registrations: RegistrationRepository
  ) {}
  async execute(input: {
    id: string;
    reason?: string;
  }): Promise<RegistrationDto> {
    const r = await this.registrations.findById(RegistrationId.of(input.id));
    if (!r) throw new NotFoundError("Registration", input.id);
    r.withdraw(input.reason);
    await this.registrations.save(r);
    return RegistrationDto.fromDomain(r);
  }
}
