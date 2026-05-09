import {
  Controller,
  Get,
  Inject,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { RegistrationDto } from "../application/dtos/registration.dto";

/**
 * Self-service registration endpoints. The admin counterpart in
 * RegistrationsController is gated by SuperAdminGuard; this controller
 * runs with JwtAuthGuard alone and only ever returns rows whose
 * subjectPersonId matches the caller's linked person record.
 *
 * Players hit this from /registrations on the player-web app to see
 * their own submissions across leagues.
 */
@ApiTags("registration/self")
@ApiBearerAuth()
@Controller("registration/self")
@UseGuards(JwtAuthGuard)
export class SelfRegistrationsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get("registrations")
  @ApiOperation({
    summary:
      "List the caller's own registrations (filtered by their linked persons.id). Heals legacy rows that pre-dated the persons.userId backfill by claiming any orphan person whose externalIds.supabaseUserId matches."
  })
  async listMine(
    @CurrentUser() principal: AuthPrincipal
  ): Promise<{ items: RegistrationDto[] }> {
    let [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, principal.userId))
      .limit(1);

    // Heal-on-read for legacy registrations: the public funnel used to
    // create persons with externalIds.supabaseUserId set but
    // persons.userId left null. Adopt those orphans here so the user's
    // full history surfaces on first call.
    if (!person) {
      const [orphan] = await this.db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(
          and(
            sql`${schema.persons.userId} IS NULL`,
            sql`${schema.persons.externalIds}->>'supabaseUserId' = ${principal.userId}`
          )
        )
        .limit(1);
      if (orphan) {
        await this.db
          .update(schema.persons)
          .set({ userId: principal.userId, updatedAt: new Date() })
          .where(eq(schema.persons.id, orphan.id));
        person = { id: orphan.id };
      }
    }

    if (!person) return { items: [] };

    const rows = await this.db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.subjectPersonId, person.id))
      .orderBy(desc(schema.registrations.createdAt))
      .limit(100);

    return {
      items: rows.map(
        (r): RegistrationDto => ({
          id: r.id,
          idempotencyKey: r.idempotencyKey,
          orgId: r.orgId,
          formVersionId: r.formVersionId,
          submittedByUserId: r.submittedByUserId,
          subjectPersonId: r.subjectPersonId,
          status: r.status as RegistrationDto["status"],
          leagueId: r.leagueId,
          divisionId: r.divisionId,
          teamId: r.teamId,
          submittedAt: r.submittedAt?.toISOString() ?? null,
          reviewedByUserId: r.reviewedByUserId,
          reviewedAt: r.reviewedAt?.toISOString() ?? null,
          decisionReason: r.decisionReason,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString()
        })
      )
    };
  }
}
