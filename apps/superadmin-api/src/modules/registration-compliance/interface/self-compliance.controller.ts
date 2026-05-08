import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  NotFoundException,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, sql } from "drizzle-orm";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { validateGoverningBodyId } from "@sportspulse/kernel";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";

class SubmitIdentityVerificationBodyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  governingBodyCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  externalId!: string;
}

interface IdentityVerificationDto {
  id: string;
  personId: string;
  governingBodyId: string;
  externalId: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Self-service compliance endpoints. Unlike the admin-only controllers
 * in this module, these run with JwtAuthGuard alone and resolve the
 * caller's personId from their session — players use this to attest
 * their own governing-body IDs (e.g. USA Hockey) without admin help.
 *
 * Format validation lives in @sportspulse/kernel so the funnel +
 * compliance page share one source of truth.
 */
@ApiTags("compliance/self")
@ApiBearerAuth()
@Controller("compliance/self")
@UseGuards(JwtAuthGuard)
export class SelfComplianceController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Post("identity-verifications")
  @ApiOperation({
    summary:
      "Self-attest a governing-body external ID (e.g. USA Hockey). Format-validated; recorded as source=self_attest, status=pending."
  })
  async submitIdentityVerification(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: SubmitIdentityVerificationBodyDto
  ): Promise<IdentityVerificationDto> {
    const validation = validateGoverningBodyId(
      body.governingBodyCode,
      body.externalId
    );
    if (!validation.ok) {
      throw new BadRequestException(validation.reason);
    }

    const [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, principal.userId))
      .limit(1);
    if (!person) {
      throw new NotFoundException(
        "No person record linked to your user — finish onboarding first"
      );
    }

    const [governingBody] = await this.db
      .select({ id: schema.governingBodies.id })
      .from(schema.governingBodies)
      .where(eq(schema.governingBodies.code, body.governingBodyCode.toUpperCase()))
      .limit(1);
    if (!governingBody) {
      throw new NotFoundException(
        `Unknown governing body code "${body.governingBodyCode}"`
      );
    }

    // Upsert by (personId, governingBodyId) — the schema's unique index
    // is (personId, governingBodyId, externalId), but a player updating
    // their ID should overwrite the prior row, not stack a new one.
    const [existing] = await this.db
      .select({
        id: schema.identityVerifications.id,
        externalId: schema.identityVerifications.externalId
      })
      .from(schema.identityVerifications)
      .where(
        and(
          eq(schema.identityVerifications.personId, person.id),
          eq(schema.identityVerifications.governingBodyId, governingBody.id)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.identityVerifications)
        .set({
          externalId: validation.normalized,
          status: "pending",
          source: "self_attest",
          verifiedAt: null,
          updatedAt: sql`now()`
        })
        .where(eq(schema.identityVerifications.id, existing.id))
        .returning();
      return toDto(updated!);
    }

    const [inserted] = await this.db
      .insert(schema.identityVerifications)
      .values({
        personId: person.id,
        governingBodyId: governingBody.id,
        externalId: validation.normalized,
        status: "pending",
        source: "self_attest"
      })
      .returning();
    return toDto(inserted!);
  }
}

function toDto(row: typeof schema.identityVerifications.$inferSelect): IdentityVerificationDto {
  return {
    id: row.id,
    personId: row.personId,
    governingBodyId: row.governingBodyId,
    externalId: row.externalId,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
