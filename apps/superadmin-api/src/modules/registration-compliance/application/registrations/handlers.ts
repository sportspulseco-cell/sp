import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
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
import { DRIZZLE } from "../../../../shared/database/database.tokens";

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
    private readonly finance: FinanceService,
    @Inject(DRIZZLE) private readonly db: Database
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
      // Enrich the payload so admin-authored email_templates overrides
      // can interpolate {{playerName}}, {{seasonName}}, {{divisionName}}.
      // P3-3 / audit §3.4. seasonId is the lookup key for the override.
      const enrichment = await this.resolveEmailEnrichment(x);
      await this.notify.queue({
        orgId: x.orgId,
        templateCode: tplCode,
        idempotencyKey: `${tplCode}:${x.id}:${x.updatedAt.toISOString()}`,
        recipientPersonId: x.subjectPersonId,
        recipientEmail: enrichment.recipientEmail,
        payload: {
          personName: enrichment.playerName,
          playerName: enrichment.playerName,
          leagueName: enrichment.leagueName ?? "your league",
          seasonName: enrichment.seasonName ?? "",
          divisionName: enrichment.divisionName ?? "",
          seasonId: enrichment.seasonId,
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

  /**
   * One-shot lookup that resolves every value the registration email
   * templates may want to interpolate: the player's preferred display
   * name, the player's email, the resolved seasonId (division.seasonId
   * preferred, form.seasonId fallback), and league/season/division
   * display names. Used purely as a side-effect input for the
   * notification queue — never throws back to the caller.
   */
  private async resolveEmailEnrichment(x: {
    subjectPersonId: string;
    divisionId: string | null;
    leagueId: string | null;
    formVersionId: string;
  }): Promise<{
    playerName: string;
    recipientEmail: string | null;
    leagueName: string | null;
    seasonName: string | null;
    divisionName: string | null;
    seasonId: string | null;
  }> {
    const fallback = {
      playerName: "registrant",
      recipientEmail: null,
      leagueName: null,
      seasonName: null,
      divisionName: null,
      seasonId: null
    };
    try {
      // Person + profile email
      const [person] = await this.db
        .select({
          legalFirstName: schema.persons.legalFirstName,
          legalLastName: schema.persons.legalLastName,
          preferredName: schema.persons.preferredName,
          email: schema.profiles.email
        })
        .from(schema.persons)
        .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
        .where(eq(schema.persons.id, x.subjectPersonId))
        .limit(1);

      const fullName = person
        ? [person.legalFirstName, person.legalLastName]
            .filter(Boolean)
            .join(" ")
        : "";
      const playerName =
        person?.preferredName || fullName || "registrant";

      // League name
      let leagueName: string | null = null;
      if (x.leagueId) {
        const [league] = await this.db
          .select({ name: schema.leagues.name })
          .from(schema.leagues)
          .where(eq(schema.leagues.id, x.leagueId))
          .limit(1);
        leagueName = league?.name ?? null;
      }

      // Division + season (preferred path)
      let divisionName: string | null = null;
      let divisionSeasonId: string | null = null;
      if (x.divisionId) {
        const [division] = await this.db
          .select({
            name: schema.divisions.name,
            seasonId: schema.divisions.seasonId
          })
          .from(schema.divisions)
          .where(eq(schema.divisions.id, x.divisionId))
          .limit(1);
        divisionName = division?.name ?? null;
        divisionSeasonId = division?.seasonId ?? null;
      }

      // Form's seasonId (fallback when there's no division)
      let formSeasonId: string | null = null;
      const [fv] = await this.db
        .select({ formId: schema.registrationFormVersions.formId })
        .from(schema.registrationFormVersions)
        .where(eq(schema.registrationFormVersions.id, x.formVersionId))
        .limit(1);
      if (fv?.formId) {
        const [form] = await this.db
          .select({ seasonId: schema.registrationForms.seasonId })
          .from(schema.registrationForms)
          .where(eq(schema.registrationForms.id, fv.formId))
          .limit(1);
        formSeasonId = form?.seasonId ?? null;
      }

      const seasonId = divisionSeasonId ?? formSeasonId;
      let seasonName: string | null = null;
      if (seasonId) {
        const [season] = await this.db
          .select({ name: schema.seasons.name })
          .from(schema.seasons)
          .where(eq(schema.seasons.id, seasonId))
          .limit(1);
        seasonName = season?.name ?? null;
      }

      return {
        playerName,
        recipientEmail: person?.email ?? null,
        leagueName,
        seasonName,
        divisionName,
        seasonId
      };
    } catch {
      return fallback;
    }
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
