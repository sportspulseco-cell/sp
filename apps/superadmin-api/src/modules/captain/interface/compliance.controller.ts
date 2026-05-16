import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, eq, sql } from "drizzle-orm";
import { resolveDivisionRules } from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";

/**
 * Workflow 7B · pre-add eligibility precheck (non-blocking warnings).
 *
 * The captain UI calls this when a captain selects a candidate in the
 * Add player modal — it surfaces roster size, age, gender, and playoff
 * eligibility so the captain sees the consequences before confirming.
 *
 * The HARD block is enforced inside POST /captain/roster/:teamId/add
 * via SELECT FOR UPDATE — this endpoint is purely informational.
 */
@ApiTags("compliance")
@ApiBearerAuth()
@Controller("compliance")
@UseGuards(JwtAuthGuard)
export class ComplianceController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get("eligibility/precheck")
  @ApiOperation({
    summary:
      "Pre-add eligibility warnings. Returns roster size, age, gender, and playoff eligibility — all non-blocking. Captains see this in the Add player modal."
  })
  async precheck(
    @Query("personId") personId: string,
    @Query("divisionId") divisionId: string,
    @Query("teamId") teamId: string
  ) {
    if (!personId || !divisionId || !teamId) {
      throw new NotFoundException(
        "personId, divisionId, and teamId are required"
      );
    }

    const [division] = await this.db
      .select({
        id: schema.divisions.id,
        seasonId: schema.divisions.seasonId,
        genderEligibility: schema.divisions.genderEligibility,
        ruleSetOverrides: schema.divisions.ruleSetOverrides
      })
      .from(schema.divisions)
      .where(eq(schema.divisions.id, divisionId))
      .limit(1);
    if (!division) throw new NotFoundException("Division not found");

    const rules = resolveDivisionRules(
      (division.ruleSetOverrides as Record<string, unknown>) ?? null
    );

    const [person] = await this.db
      .select({
        id: schema.persons.id,
        dob: schema.persons.dobDate,
        genderIdentity: schema.persons.genderSelfId
      })
      .from(schema.persons)
      .where(eq(schema.persons.id, personId))
      .limit(1);
    if (!person) throw new NotFoundException("Person not found");

    // Roster size
    const counted = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.seasonId, division.seasonId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      );
    const currentCount = counted[0]?.count ?? 0;
    const rosterSizeCheck = {
      currentCount,
      maxAllowed: rules.maxRosterSize,
      wouldExceed: currentCount + 1 > rules.maxRosterSize
    };

    // Age
    let ageCheck:
      | { status: "eligible"; ageYears: number }
      | {
          status: "out_of_range";
          ageYears: number;
          minYears?: number;
          maxYears?: number;
        }
      | { status: "unknown" } = { status: "unknown" };
    if (person.dob) {
      const ageYears = yearsBetween(person.dob, new Date());
      const out =
        (rules.ageMinYears !== undefined && ageYears < rules.ageMinYears) ||
        (rules.ageMaxYears !== undefined && ageYears > rules.ageMaxYears);
      ageCheck = out
        ? {
            status: "out_of_range",
            ageYears,
            minYears: rules.ageMinYears,
            maxYears: rules.ageMaxYears
          }
        : { status: "eligible", ageYears };
    }

    // Gender — never a hard block; warn if mismatch with division eligibility.
    const genderCheck =
      division.genderEligibility === "open" || !person.genderIdentity
        ? { status: "eligible" as const }
        : matchesGender(division.genderEligibility, person.genderIdentity)
          ? { status: "eligible" as const }
          : {
              status: "warning" as const,
              divisionEligibility: division.genderEligibility,
              personGender: person.genderIdentity
            };

    // Playoff eligibility — uses minGamesForPlayoffs + completed games count
    // (simple heuristic; real game-counting happens elsewhere).
    const gamesPlayed = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schema.gameAttendance)
      .where(
        and(
          eq(schema.gameAttendance.personId, personId),
          eq(schema.gameAttendance.teamId, teamId)
        )
      );
    const completedGames = gamesPlayed[0]?.count ?? 0;
    const remainingApprox = 0; // schedule projection is out of Sprint 5 scope
    const playoffWarning = {
      gamesPlayed: completedGames,
      gamesRemaining: remainingApprox,
      minRequired: rules.minGamesForPlayoffs,
      willBePlayoffEligible:
        completedGames + remainingApprox >= rules.minGamesForPlayoffs,
      message:
        completedGames + remainingApprox >= rules.minGamesForPlayoffs
          ? null
          : "This player may not meet the minimum games played for playoff eligibility."
    };

    return {
      rosterSizeCheck,
      ageCheck,
      genderCheck,
      playoffWarning
    };
  }
}

function yearsBetween(from: Date | string, to: Date): number {
  const start = typeof from === "string" ? new Date(from) : from;
  let years = to.getFullYear() - start.getFullYear();
  const m = to.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < start.getDate())) years--;
  return years;
}

function matchesGender(eligibility: string, identity: string): boolean {
  const e = eligibility.toLowerCase();
  const i = identity.toLowerCase();
  if (e === "mixed" || e === "open") return true;
  if (e === "male") return i === "male" || i === "m";
  if (e === "female") return i === "female" || i === "f";
  return true;
}
