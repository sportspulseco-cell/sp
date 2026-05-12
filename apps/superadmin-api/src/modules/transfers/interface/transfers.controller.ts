import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString, IsUUID, MinLength } from "class-validator";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  ROSTER_DROP_REASON_MIN_CHARS,
  assertValidTransferTransition,
  isTransferState
} from "@sportspulse/kernel";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
import { NotificationService } from "../../communications/application/notification.service";

class InitiateTransferBodyDto {
  @IsUUID() personId!: string;
  @IsUUID() toTeamId!: string;
  @IsString() @MinLength(ROSTER_DROP_REASON_MIN_CHARS) reason!: string;
}

class RejectBodyDto {
  @IsString() @MinLength(ROSTER_DROP_REASON_MIN_CHARS) reason!: string;
}

/**
 * Captain-facing transfer endpoints (Workflow 7B · Case 6).
 *
 * The transfer state machine lives in `transfer_requests`; roster
 * mutations stay in roster_moves only at approval time.
 */
@ApiTags("league/teams/transfer")
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class TransfersController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  // ---- Source captain initiates ------------------------------------
  @Post("league/teams/:id/transfer")
  @ApiOperation({
    summary:
      "Source captain initiates a player transfer to another team. Creates a transfer_requests row in `pending_destination`. Notifies the destination captain."
  })
  async initiate(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") fromTeamId: string,
    @Body() body: InitiateTransferBodyDto
  ) {
    const fromTeam = await this.requireCaptainTeam(user.userId, fromTeamId);
    const toTeam = await this.loadTeam(body.toTeamId);
    if (!toTeam) throw new NotFoundException("Destination team not found");

    // Player must be on the source team's active roster, and we need
    // the current season so the transfer is scoped correctly.
    const [active] = await this.db
      .select({
        seasonId: schema.teamMemberships.seasonId
      })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, fromTeamId),
          eq(schema.teamMemberships.personId, body.personId),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      )
      .limit(1);
    if (!active) {
      throw new ConflictException({
        error: "Not on roster",
        message: "This player is not on your active roster."
      });
    }

    // Refuse if there's already an in-flight transfer for this person.
    const existing = await this.db
      .select({ id: schema.transferRequests.id })
      .from(schema.transferRequests)
      .where(
        and(
          eq(schema.transferRequests.personId, body.personId),
          eq(schema.transferRequests.seasonId, active.seasonId),
          inArray(schema.transferRequests.status, [
            "pending_destination",
            "pending_admin"
          ])
        )
      )
      .limit(1);
    if (existing[0]) {
      throw new ConflictException({
        error: "Already pending",
        message: "An in-flight transfer for this player already exists."
      });
    }

    const tRows = await this.db
      .insert(schema.transferRequests)
      .values({
        orgId: fromTeam.orgId,
        seasonId: active.seasonId,
        personId: body.personId,
        fromTeamId,
        toTeamId: body.toTeamId,
        status: "pending_destination",
        reason: body.reason.trim(),
        initiatedByUserId: user.userId,
        initiatedAt: new Date()
      })
      .returning();
    const transfer = tRows[0]!;

    void this.notify.queue({
      orgId: toTeam.orgId,
      templateCode: "TRANSFER_REQUEST",
      idempotencyKey: `transfer-request-${transfer.id}`,
      payload: {
        sourceTeam: fromTeam.name,
        playerName: body.personId,
        transferId: transfer.id
      }
    });

    return { transfer };
  }

  // ---- Destination captain accepts ---------------------------------
  @Post("league/teams/transfer/:id/accept")
  @ApiOperation({
    summary:
      "Destination captain accepts. Transitions transfer_requests.status pending_destination → pending_admin and notifies the league admin."
  })
  async accept(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") transferId: string
  ) {
    const [tr] = await this.db
      .select()
      .from(schema.transferRequests)
      .where(eq(schema.transferRequests.id, transferId))
      .limit(1);
    if (!tr) throw new NotFoundException("Transfer not found");

    await this.requireCaptainTeam(user.userId, tr.toTeamId);

    if (!isTransferState(tr.status)) {
      throw new ConflictException("Invalid transfer state");
    }
    assertValidTransferTransition(tr.status, "pending_admin");

    const updated = await this.db
      .update(schema.transferRequests)
      .set({
        status: "pending_admin",
        acceptedByUserId: user.userId,
        acceptedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(schema.transferRequests.id, transferId))
      .returning();

    return { transfer: updated[0]! };
  }

  // ---- Source captain cancels --------------------------------------
  @Post("league/teams/transfer/:id/cancel")
  @ApiOperation({
    summary:
      "Source captain cancels an open transfer before the destination has accepted. Sets status=cancelled."
  })
  async cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") transferId: string
  ) {
    const [tr] = await this.db
      .select()
      .from(schema.transferRequests)
      .where(eq(schema.transferRequests.id, transferId))
      .limit(1);
    if (!tr) throw new NotFoundException("Transfer not found");
    await this.requireCaptainTeam(user.userId, tr.fromTeamId);
    if (!isTransferState(tr.status)) {
      throw new ConflictException("Invalid transfer state");
    }
    assertValidTransferTransition(tr.status, "cancelled");
    const updated = await this.db
      .update(schema.transferRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(schema.transferRequests.id, transferId))
      .returning();
    return { transfer: updated[0]! };
  }

  // ---- Captain views their queue -----------------------------------
  @Get("captain/transfers/incoming/:teamId")
  @ApiOperation({
    summary:
      "Transfers awaiting this captain's acceptance (destination = this team)."
  })
  async listIncoming(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string
  ) {
    await this.requireCaptainTeam(user.userId, teamId);
    const items = await this.db
      .select()
      .from(schema.transferRequests)
      .where(
        and(
          eq(schema.transferRequests.toTeamId, teamId),
          eq(schema.transferRequests.status, "pending_destination")
        )
      )
      .orderBy(desc(schema.transferRequests.createdAt));
    return { items };
  }

  @Get("captain/transfers/outgoing/:teamId")
  @ApiOperation({
    summary:
      "Transfers this captain initiated, in any state (active and history)."
  })
  async listOutgoing(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string
  ) {
    await this.requireCaptainTeam(user.userId, teamId);
    const items = await this.db
      .select()
      .from(schema.transferRequests)
      .where(eq(schema.transferRequests.fromTeamId, teamId))
      .orderBy(desc(schema.transferRequests.createdAt))
      .limit(50);
    return { items };
  }

  // ---- Source captain may also reject a pending request ----------
  @Post("league/teams/transfer/:id/captain-reject")
  @ApiOperation({
    summary:
      "Source captain rejects an in-flight transfer they initiated (alternative to cancel — reason required)."
  })
  async captainReject(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") transferId: string,
    @Body() body: RejectBodyDto
  ) {
    const [tr] = await this.db
      .select()
      .from(schema.transferRequests)
      .where(eq(schema.transferRequests.id, transferId))
      .limit(1);
    if (!tr) throw new NotFoundException("Transfer not found");
    if (
      !(await this.userIsCaptainOf(user.userId, tr.fromTeamId)) &&
      !(await this.userIsCaptainOf(user.userId, tr.toTeamId))
    ) {
      throw new ForbiddenException("Not the captain of either side");
    }
    if (!isTransferState(tr.status)) {
      throw new ConflictException("Invalid transfer state");
    }
    assertValidTransferTransition(tr.status, "rejected");
    const updated = await this.db
      .update(schema.transferRequests)
      .set({
        status: "rejected",
        rejectedByUserId: user.userId,
        rejectedAt: new Date(),
        rejectionReason: body.reason.trim(),
        updatedAt: new Date()
      })
      .where(eq(schema.transferRequests.id, transferId))
      .returning();

    void this.notify.queue({
      orgId: tr.orgId,
      templateCode: "TRANSFER_REJECTED",
      idempotencyKey: `transfer-rejected-${tr.id}`,
      payload: { playerName: tr.personId, reason: body.reason.trim() }
    });

    return { transfer: updated[0]! };
  }

  // ---- Helpers ------------------------------------------------------

  private async requireCaptainTeam(userId: string, teamId: string) {
    const team = await this.loadTeam(teamId);
    if (!team) throw new NotFoundException("Team not found");
    const ok = await userIsCaptainOfTeam(
      this.db,
      userId,
      teamId,
      team.captainUserId
    );
    if (!ok) throw new ForbiddenException("Not the captain");
    return team;
  }

  private async userIsCaptainOf(
    userId: string,
    teamId: string
  ): Promise<boolean> {
    return userIsCaptainOfTeam(this.db, userId, teamId);
  }

  private async loadTeam(teamId: string) {
    const [t] = await this.db
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        orgId: schema.teams.orgId,
        captainUserId: schema.teams.captainUserId
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    return t ?? null;
  }

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ isSuper: schema.profiles.isSuperAdmin })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, userId))
      .limit(1);
    return row?.isSuper ?? false;
  }
}
