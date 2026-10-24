import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Logger,
  NotFoundException,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength
} from "class-validator";
import { and, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
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
import { userHasOrgAdminOnOrg } from "../../../shared/auth/org-admin";
import {
  activeMemberPersonIds,
  assertTargetInOrg,
  ORG_TARGET_TYPES,
  type OrgTargetType,
  teamIdsInTarget
} from "../../../shared/audience/org-targets";
import { NotificationService } from "../../communications/application/notification.service";

const AUDIENCES = ["captains", "coaches", "players", "referees", "all_admins"] as const;
type Audience = (typeof AUDIENCES)[number];

/**
 * Channels an announcement can go out on today. SMS has no provider and
 * push has no subscribed devices yet, so offering them would queue rows
 * that can never be delivered.
 */
const CHANNELS = ["email", "in_app"] as const;
type Channel = (typeof CHANNELS)[number];

const ADMIN_ROLE_CODES = ["org_admin", "league_admin", "season_admin", "division_admin"];

class BroadcastBodyDto {
  @IsUUID() orgId!: string;
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(AUDIENCES as unknown as string[], { each: true })
  audiences!: Audience[];
  /** Part of the org to reach. Default: the whole org. */
  @IsOptional()
  @IsIn(ORG_TARGET_TYPES)
  targetType?: OrgTargetType;
  /** League / season / division / team id. Ignored for the whole org. */
  @IsOptional() @IsUUID() targetId?: string;
  @IsString() @Length(1, 200) subject!: string;
  @IsString() @Length(1, 5000) @MaxLength(5000) body!: string;
  /** One or more channels; one notification per recipient per channel. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(CHANNELS as unknown as string[], { each: true })
  channels?: Channel[];
  /** Older clients send a single channel. */
  @IsOptional() @IsIn(CHANNELS as unknown as string[]) channel?: Channel;
  /**
   * One key per composed announcement. A retry or double click with the
   * same key returns the first result instead of sending again.
   */
  @IsOptional() @IsUUID() idempotencyKey?: string;
}

interface TargetScope {
  teamIds: string[];
  leagueIds: string[];
  seasonIds: string[];
  divisionIds: string[];
}

/**
 * League announcement (UC-19). An org admin picks who (captains,
 * coaches, players, referees, admins), where in the org (whole org, a
 * league, season, division or team: real entities picked from lists,
 * never typed ids), and how (email, in-app, or both).
 *
 * The server owns the recipient list: the target is checked against the
 * caller's org (404 when it is not in it), and every recipient is
 * resolved from that target inside the org. Each recipient gets one
 * notification per channel, idempotent on
 * `broadcast-<key>-<personId>-<channel>`.
 *
 * Not built (no model yet): schedule for later, attachments, SMS, push.
 */
@ApiTags("org-admin/broadcast")
@ApiBearerAuth()
@Controller("org-admin/broadcast")
@UseGuards(JwtAuthGuard, AuthorizedAccessGuard)
export class OrgAdminBroadcastController {
  private readonly log = new Logger(OrgAdminBroadcastController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  @Post()
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Send an announcement to chosen audiences in the whole org or one league / season / division / team of it, on one or more channels. Recipients are resolved on the server inside the caller's org. Idempotent on idempotencyKey."
  })
  async broadcast(
    @Body() body: BroadcastBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @UserScope() scope: UserScopeType
  ) {
    if (!scope.isSuperAdmin) {
      if (scope.orgIds !== null && !scope.orgIds.includes(body.orgId)) {
        throw new NotFoundException("Org not found");
      }
      if (!(await userHasOrgAdminOnOrg(this.db, user.userId, body.orgId))) {
        throw new ForbiddenException(
          "Requires org_admin (or super_admin) on this org"
        );
      }
    }

    const targetType: OrgTargetType = body.targetType ?? "org";
    const targetId = targetType === "org" ? body.orgId : body.targetId;
    if (!targetId) {
      throw new BadRequestException(`Pick the ${targetType} to send to.`);
    }
    await assertTargetInOrg(this.db, targetType, targetId, body.orgId);

    const channels: Channel[] = Array.from(
      new Set(body.channels ?? (body.channel ? [body.channel] : []))
    );
    if (channels.length === 0) {
      throw new BadRequestException("Pick at least one channel.");
    }
    const audiences = Array.from(new Set(body.audiences));
    const broadcastId =
      body.idempotencyKey ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const keyPrefix = `broadcast-${broadcastId}-`;

    // Replay of an announcement that was already sent with this key.
    if (body.idempotencyKey) {
      const [prior] = await this.db
        .select({
          rows: sql<number>`COUNT(*)::int`,
          people: sql<number>`COUNT(DISTINCT ${schema.notifications.recipientPersonId})::int`
        })
        .from(schema.notifications)
        .where(like(schema.notifications.idempotencyKey, `${keyPrefix}%`));
      if (Number(prior?.rows ?? 0) > 0) {
        this.log.log(
          `broadcast replay key=${broadcastId} org=${body.orgId} rows=${prior?.rows}`
        );
        return {
          broadcastId,
          idempotent: true,
          recipients: Number(prior?.people ?? 0),
          audiencesResolved: Number(prior?.people ?? 0),
          queued: Number(prior?.rows ?? 0),
          failed: 0,
          noEmail: 0,
          channels
        };
      }
    }

    const target = await this.targetScope(targetType, targetId, body.orgId);
    const recipients = await this.resolveRecipients(target, body.orgId, audiences);

    let queued = 0;
    let failed = 0;
    let noEmail = 0;
    for (const r of recipients) {
      for (const channel of channels) {
        if (channel === "email" && !r.email) {
          // No address on file: nothing to queue for this channel.
          noEmail += 1;
          continue;
        }
        const row = await this.notify.queue({
          orgId: body.orgId,
          templateCode: "org.broadcast",
          channel,
          idempotencyKey: `${keyPrefix}${r.personId}-${channel}`,
          recipientPersonId: r.personId,
          recipientEmail: channel === "email" ? r.email : null,
          payload: {
            subject: body.subject,
            body: body.body,
            broadcastId,
            targetType,
            targetId,
            audiences
          },
          sourceEvent: "org.broadcast"
        });
        if (row) queued += 1;
        else failed += 1;
      }
    }

    this.log.log(
      `broadcast key=${broadcastId} org=${body.orgId} target=${targetType}:${targetId} audiences=${audiences.join(",")} channels=${channels.join(",")} recipients=${recipients.length} queued=${queued} failed=${failed} noEmail=${noEmail}`
    );
    return {
      broadcastId,
      idempotent: false,
      recipients: recipients.length,
      audiencesResolved: recipients.length,
      queued,
      /** Rows the notification service could not write (see API log). */
      failed,
      /** Email channel skipped: the person has no email on file. */
      noEmail,
      channels
    };
  }

  /** Teams, leagues, seasons and divisions that sit under the target. */
  private async targetScope(
    type: OrgTargetType,
    targetId: string,
    orgId: string
  ): Promise<TargetScope> {
    const teamIds = await teamIdsInTarget(this.db, type, targetId, orgId);

    if (type === "org") {
      const leagues = await this.db
        .select({ id: schema.leagues.id })
        .from(schema.leagues)
        .where(eq(schema.leagues.orgId, orgId));
      const seasons = await this.db
        .select({ id: schema.seasons.id })
        .from(schema.seasons)
        .where(eq(schema.seasons.orgId, orgId));
      const divisions = seasons.length
        ? await this.db
            .select({ id: schema.divisions.id })
            .from(schema.divisions)
            .where(inArray(schema.divisions.seasonId, seasons.map((s) => s.id)))
        : [];
      return {
        teamIds,
        leagueIds: leagues.map((l) => l.id),
        seasonIds: seasons.map((s) => s.id),
        divisionIds: divisions.map((d) => d.id)
      };
    }

    // Divisions under the target, with their season and league.
    const where =
      type === "league"
        ? eq(schema.seasons.leagueId, targetId)
        : type === "season"
          ? eq(schema.divisions.seasonId, targetId)
          : type === "division"
            ? eq(schema.divisions.id, targetId)
            : teamIds.length
              ? inArray(
                  schema.divisions.id,
                  this.db
                    .select({ id: schema.divisionTeamEntries.divisionId })
                    .from(schema.divisionTeamEntries)
                    .where(
                      and(
                        inArray(schema.divisionTeamEntries.teamId, teamIds),
                        inArray(schema.divisionTeamEntries.entryStatus, [
                          "applied",
                          "confirmed"
                        ])
                      )
                    )
                )
              : sql`false`;
    const rows = await this.db
      .select({
        divisionId: schema.divisions.id,
        seasonId: schema.seasons.id,
        leagueId: schema.seasons.leagueId
      })
      .from(schema.divisions)
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(and(where, eq(schema.seasons.orgId, orgId)));

    const leagueIds = new Set(rows.map((r) => r.leagueId));
    const seasonIds = new Set(rows.map((r) => r.seasonId));
    if (type === "league") {
      leagueIds.add(targetId);
      const seasons = await this.db
        .select({ id: schema.seasons.id })
        .from(schema.seasons)
        .where(eq(schema.seasons.leagueId, targetId));
      for (const x of seasons) seasonIds.add(x.id);
    }
    if (type === "season") {
      seasonIds.add(targetId);
      const [s] = await this.db
        .select({ leagueId: schema.seasons.leagueId })
        .from(schema.seasons)
        .where(eq(schema.seasons.id, targetId))
        .limit(1);
      if (s) leagueIds.add(s.leagueId);
    }
    return {
      teamIds,
      leagueIds: [...leagueIds],
      seasonIds: [...seasonIds],
      divisionIds: rows.map((r) => r.divisionId)
    };
  }

  /**
   * Distinct people (with their sign-in email) for the audiences, all
   * inside `orgId`. A person in two audiences is listed once.
   */
  private async resolveRecipients(
    target: TargetScope,
    orgId: string,
    audiences: Audience[]
  ): Promise<Array<{ personId: string; email: string | null }>> {
    const personIds = new Set<string>();
    const userIds = new Set<string>();

    if (audiences.includes("players")) {
      for (const id of await activeMemberPersonIds(this.db, target.teamIds)) {
        personIds.add(id);
      }
    }

    const teamRoles: string[] = [];
    if (audiences.includes("captains")) teamRoles.push("captain");
    if (audiences.includes("coaches")) teamRoles.push("coach");
    if (teamRoles.length && target.teamIds.length) {
      const rows = await this.db
        .select({ userId: schema.userRoleAssignments.userId })
        .from(schema.userRoleAssignments)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
        .where(
          and(
            eq(schema.userRoleAssignments.scopeType, "team"),
            inArray(schema.userRoleAssignments.scopeId, target.teamIds),
            inArray(schema.roles.code, teamRoles),
            isNull(schema.userRoleAssignments.revokedAt)
          )
        );
      for (const r of rows) userIds.add(r.userId);
    }

    if (audiences.includes("referees") && target.leagueIds.length) {
      const rows = await this.db
        .select({ userId: schema.userRoleAssignments.userId })
        .from(schema.userRoleAssignments)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
        .where(
          and(
            eq(schema.userRoleAssignments.scopeType, "league"),
            inArray(schema.userRoleAssignments.scopeId, target.leagueIds),
            eq(schema.roles.code, "referee"),
            isNull(schema.userRoleAssignments.revokedAt)
          )
        );
      for (const r of rows) userIds.add(r.userId);
    }

    if (audiences.includes("all_admins")) {
      const scoped = [
        and(
          eq(schema.userRoleAssignments.scopeType, "org"),
          eq(schema.userRoleAssignments.scopeId, orgId)
        )
      ];
      if (target.leagueIds.length) {
        scoped.push(
          and(
            eq(schema.userRoleAssignments.scopeType, "league"),
            inArray(schema.userRoleAssignments.scopeId, target.leagueIds)
          )
        );
      }
      if (target.seasonIds.length) {
        scoped.push(
          and(
            eq(schema.userRoleAssignments.scopeType, "season"),
            inArray(schema.userRoleAssignments.scopeId, target.seasonIds)
          )
        );
      }
      if (target.divisionIds.length) {
        scoped.push(
          and(
            eq(schema.userRoleAssignments.scopeType, "division"),
            inArray(schema.userRoleAssignments.scopeId, target.divisionIds)
          )
        );
      }
      const rows = await this.db
        .select({ userId: schema.userRoleAssignments.userId })
        .from(schema.userRoleAssignments)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoleAssignments.roleId))
        .where(
          and(
            or(...scoped),
            inArray(schema.roles.code, ADMIN_ROLE_CODES),
            isNull(schema.userRoleAssignments.revokedAt)
          )
        );
      for (const r of rows) userIds.add(r.userId);
    }

    if (userIds.size > 0) {
      const persons = await this.db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(inArray(schema.persons.userId, [...userIds]));
      for (const p of persons) personIds.add(p.id);
    }
    if (personIds.size === 0) return [];

    const persons = await this.db
      .select({ id: schema.persons.id, email: schema.profiles.email })
      .from(schema.persons)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(inArray(schema.persons.id, [...personIds]));
    return persons.map((p) => ({ personId: p.id, email: p.email }));
  }
}
