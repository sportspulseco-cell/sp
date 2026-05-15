import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Length,
  MaxLength
} from "class-validator";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { NotificationService } from "../../communications/application/notification.service";

type Audience = "captains" | "team_admins" | "players" | "all_admins";

class BroadcastBodyDto {
  @IsUUID() orgId!: string;
  @IsArray()
  @IsIn(["captains", "team_admins", "players", "all_admins"], { each: true })
  audiences!: Audience[];
  @IsString() @Length(1, 200) subject!: string;
  @IsString() @Length(1, 5000) @MaxLength(5000) body!: string;
  @IsIn(["email", "in_app"]) channel!: "email" | "in_app";
}

/**
 * Backlog #6 / #17 — ad-hoc broadcast composer. An org-admin can send
 * a templated message to an audience scoped to their org. Each
 * matching recipient gets a single notification row (idempotent on
 * `broadcast-<id>-<personId>` so retries don't multi-queue).
 *
 * Audiences:
 *   - captains      → users with active captain role scoped to a team
 *                     whose org_id = body.orgId
 *   - team_admins   → users with active team_admin role on such a team
 *   - players       → distinct persons holding an active membership in
 *                     a team in this org
 *   - all_admins    → super_admin / org_admin / league_admin /
 *                     season_admin / division_admin scoped to the org
 *                     (or any league inside it)
 *
 * The `org.broadcast` template is added to the catalog so the existing
 * renderer + dispatcher path works untouched.
 */
@ApiTags("org-admin/broadcast")
@ApiBearerAuth()
@Controller("org-admin/broadcast")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminBroadcastController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  @Post()
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Queue a notification per recipient matched by the chosen audiences. Idempotent on (broadcast-id, personId)."
  })
  async broadcast(
    @Body() body: BroadcastBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    if (body.audiences.length === 0) {
      throw new BadRequestException("Pick at least one audience.");
    }
    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(body.orgId)) {
        throw new ForbiddenException("Org not in scope");
      }
      const ok = await this.userHasOrgAdminOnOrg(user.userId, body.orgId);
      if (!ok) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }

    const recipients = await this.resolveRecipients(body.orgId, body.audiences);
    if (recipients.length === 0) {
      return { queued: 0, audiencesResolved: 0 };
    }

    // Stable id so all per-recipient rows share a broadcast key.
    const broadcastId = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    let queued = 0;
    for (const r of recipients) {
      const result = await this.notify.queue({
        orgId: body.orgId,
        templateCode: "org.broadcast",
        channel: body.channel,
        idempotencyKey: `broadcast-${broadcastId}-${r.personId}`,
        recipientPersonId: r.personId,
        recipientEmail: body.channel === "email" ? r.email : null,
        payload: {
          subject: body.subject,
          body: body.body
        },
        sourceEvent: "org.broadcast"
      });
      if (result) queued += 1;
    }

    return { queued, audiencesResolved: recipients.length, broadcastId };
  }

  /**
   * Distinct personIds + emails matching one of the requested audiences.
   * Same person showing up under multiple audiences gets one row.
   */
  private async resolveRecipients(
    orgId: string,
    audiences: Audience[]
  ): Promise<Array<{ personId: string; email: string | null }>> {
    const personIds = new Set<string>();

    if (audiences.includes("captains") || audiences.includes("team_admins")) {
      const codes: string[] = [];
      if (audiences.includes("captains")) codes.push("captain");
      if (audiences.includes("team_admins")) codes.push("team_admin", "coach");
      const rows = await this.db
        .select({
          userId: schema.userRoleAssignments.userId
        })
        .from(schema.userRoleAssignments)
        .innerJoin(
          schema.roles,
          eq(schema.roles.id, schema.userRoleAssignments.roleId)
        )
        .innerJoin(
          schema.teams,
          eq(schema.teams.id, schema.userRoleAssignments.scopeId)
        )
        .where(
          and(
            eq(schema.userRoleAssignments.scopeType, "team"),
            eq(schema.teams.orgId, orgId),
            inArray(schema.roles.code, codes),
            isNull(schema.userRoleAssignments.revokedAt)
          )
        );
      const userIds = rows.map((r) => r.userId);
      if (userIds.length > 0) {
        const persons = await this.db
          .select({ id: schema.persons.id })
          .from(schema.persons)
          .where(inArray(schema.persons.userId, userIds));
        for (const p of persons) personIds.add(p.id);
      }
    }

    if (audiences.includes("players")) {
      const rows = await this.db
        .selectDistinct({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .innerJoin(
          schema.teams,
          eq(schema.teams.id, schema.teamMemberships.teamId)
        )
        .where(
          and(
            eq(schema.teams.orgId, orgId),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      for (const r of rows) personIds.add(r.personId);
    }

    if (audiences.includes("all_admins")) {
      const adminCodes = [
        "org_admin",
        "league_admin",
        "season_admin",
        "division_admin"
      ];
      const orgScopeRows = await this.db
        .select({ userId: schema.userRoleAssignments.userId })
        .from(schema.userRoleAssignments)
        .innerJoin(
          schema.roles,
          eq(schema.roles.id, schema.userRoleAssignments.roleId)
        )
        .where(
          and(
            eq(schema.userRoleAssignments.scopeType, "org"),
            eq(schema.userRoleAssignments.scopeId, orgId),
            inArray(schema.roles.code, adminCodes),
            isNull(schema.userRoleAssignments.revokedAt)
          )
        );
      const leagueIds = await this.db
        .select({ id: schema.leagues.id })
        .from(schema.leagues)
        .where(eq(schema.leagues.orgId, orgId));
      let leagueScopeRows: Array<{ userId: string }> = [];
      if (leagueIds.length > 0) {
        leagueScopeRows = await this.db
          .select({ userId: schema.userRoleAssignments.userId })
          .from(schema.userRoleAssignments)
          .innerJoin(
            schema.roles,
            eq(schema.roles.id, schema.userRoleAssignments.roleId)
          )
          .where(
            and(
              eq(schema.userRoleAssignments.scopeType, "league"),
              inArray(
                schema.userRoleAssignments.scopeId,
                leagueIds.map((l) => l.id)
              ),
              inArray(schema.roles.code, adminCodes),
              isNull(schema.userRoleAssignments.revokedAt)
            )
          );
      }
      const userIds = Array.from(
        new Set([
          ...orgScopeRows.map((r) => r.userId),
          ...leagueScopeRows.map((r) => r.userId)
        ])
      );
      if (userIds.length > 0) {
        const persons = await this.db
          .select({ id: schema.persons.id })
          .from(schema.persons)
          .where(inArray(schema.persons.userId, userIds));
        for (const p of persons) personIds.add(p.id);
      }
    }

    if (personIds.size === 0) return [];

    const persons = await this.db
      .select({
        id: schema.persons.id,
        email: schema.profiles.email
      })
      .from(schema.persons)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(inArray(schema.persons.id, Array.from(personIds)));

    return persons.map((p) => ({ personId: p.id, email: p.email }));
  }

  private async userHasOrgAdminOnOrg(
    userId: string,
    orgId: string
  ): Promise<boolean> {
    const rows = await this.db
      .select({ code: schema.roles.code })
      .from(schema.userRoleAssignments)
      .innerJoin(
        schema.roles,
        eq(schema.roles.id, schema.userRoleAssignments.roleId)
      )
      .where(
        and(
          eq(schema.userRoleAssignments.userId, userId),
          eq(schema.userRoleAssignments.scopeType, "org"),
          eq(schema.userRoleAssignments.scopeId, orgId),
          isNull(schema.userRoleAssignments.revokedAt)
        )
      );
    return rows.some((r) => ["super_admin", "org_admin"].includes(r.code));
  }
}
