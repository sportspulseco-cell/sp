import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { RegistrationForm } from "../../domain/entities/registration-form.entity";
import type { Registration } from "../../domain/entities/registration.entity";
import type { EligibilityRecord } from "../../domain/entities/eligibility-record.entity";
import type { FormVersionRow } from "../../domain/repositories/registration-form.repository";
import {
  ELIGIBILITY_STATUSES,
  REGISTRATION_STATUSES
} from "../../domain/value-objects/statuses.vo";

export class RegistrationFormDto {
  @ApiProperty() id!: string;
  @ApiProperty() orgId!: string;
  @ApiProperty({ enum: ["org", "league", "division"] })
  scope!: "org" | "league" | "division";
  @ApiPropertyOptional({ nullable: true }) scopeId!: string | null;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true }) activeVersionId!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(f: RegistrationForm): RegistrationFormDto {
    const x = f.toSnapshot();
    return {
      id: x.id,
      orgId: x.orgId,
      scope: x.scope,
      scopeId: x.scopeId,
      name: x.name,
      description: x.description,
      activeVersionId: x.activeVersionId,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class RegistrationFormPageDto {
  @ApiProperty({ type: [RegistrationFormDto] }) items!: RegistrationFormDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class FormVersionDto {
  @ApiProperty() id!: string;
  @ApiProperty() formId!: string;
  @ApiProperty() versionNumber!: number;
  @ApiProperty() schema!: Record<string, unknown>;
  @ApiPropertyOptional({ nullable: true }) publishedAt!: string | null;
  @ApiProperty() locked!: boolean;
  @ApiProperty() createdAt!: string;

  static fromRow(r: FormVersionRow): FormVersionDto {
    return {
      id: r.id,
      formId: r.formId,
      versionNumber: r.versionNumber,
      schema: r.schema,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      locked: r.locked,
      createdAt: r.createdAt.toISOString()
    };
  }
}

export class RegistrationDto {
  @ApiProperty() id!: string;
  @ApiProperty() idempotencyKey!: string;
  @ApiProperty() orgId!: string;
  @ApiProperty() formVersionId!: string;
  @ApiPropertyOptional({ nullable: true }) submittedByUserId!: string | null;
  @ApiProperty() subjectPersonId!: string;
  @ApiProperty({ enum: REGISTRATION_STATUSES })
  status!: (typeof REGISTRATION_STATUSES)[number];
  @ApiPropertyOptional({ nullable: true }) leagueId!: string | null;
  @ApiPropertyOptional({ nullable: true }) divisionId!: string | null;
  @ApiPropertyOptional({ nullable: true }) teamId!: string | null;
  @ApiPropertyOptional({ nullable: true }) submittedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) reviewedByUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) reviewedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) decisionReason!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(r: Registration): RegistrationDto {
    const x = r.toSnapshot();
    return {
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
      submittedAt: x.submittedAt?.toISOString() ?? null,
      reviewedByUserId: x.reviewedByUserId,
      reviewedAt: x.reviewedAt?.toISOString() ?? null,
      decisionReason: x.decisionReason,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class RegistrationPageDto {
  @ApiProperty({ type: [RegistrationDto] }) items!: RegistrationDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class EligibilityRecordDto {
  @ApiProperty() id!: string;
  @ApiProperty() personId!: string;
  @ApiPropertyOptional({ nullable: true }) seasonId!: string | null;
  @ApiPropertyOptional({ nullable: true }) governingBodyId!: string | null;
  @ApiProperty({ enum: ELIGIBILITY_STATUSES })
  status!: (typeof ELIGIBILITY_STATUSES)[number];
  @ApiPropertyOptional({ nullable: true }) waiverReason!: string | null;
  @ApiProperty() ruleEvaluation!: Record<string, unknown>;
  @ApiProperty() effectiveFrom!: string;
  @ApiPropertyOptional({ nullable: true }) effectiveTo!: string | null;
  @ApiProperty() evaluatedAt!: string;

  static fromDomain(e: EligibilityRecord): EligibilityRecordDto {
    const x = e.toSnapshot();
    return {
      id: x.id,
      personId: x.personId,
      seasonId: x.seasonId,
      governingBodyId: x.governingBodyId,
      status: x.status,
      waiverReason: x.waiverReason,
      ruleEvaluation: x.ruleEvaluation,
      effectiveFrom: x.effectiveFrom.toISOString(),
      effectiveTo: x.effectiveTo?.toISOString() ?? null,
      evaluatedAt: x.evaluatedAt.toISOString()
    };
  }
}

export class EligibilityRecordPageDto {
  @ApiProperty({ type: [EligibilityRecordDto] }) items!: EligibilityRecordDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
