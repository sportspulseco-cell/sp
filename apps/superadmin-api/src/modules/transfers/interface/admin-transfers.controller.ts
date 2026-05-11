import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { and, desc, eq, inArray } from "drizzle-orm";
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
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { NotificationService } from "../../communications/application/notification.service";

class RejectBodyDto {
  @IsString() @MinLength(ROSTER_DROP_REASON_MIN_CHARS) reason!: string;
}

class ListQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() orgId?: string;
}

/**
 * Admin-only transfers surface (Workflow 7B · Case 6).
 *
 * Approve does the heavy lift: on a pending_admin row it atomically
 * 1. writes roster_moves: drop on the source team
 * 2. updates team_memberships: source → released
 * 3. writes roster_moves: add on the destination team
 * 4. writes team_memberships: destination → active
 * 5. closes the source sub-invoice (creating a refund_assessment if
 *    paid, voiding if unpaid)
 * 6. creates a fresh sub-invoice on the destination team's master
 * 7. flips transfer_requests.status to approved
 */
@ApiTags("league/admin/transfers")
@ApiBearerAuth()
@Controller("league")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminTransfersController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  @Get("admin/transfers")
  @ApiOperation({
    summary:
      "Admin transfer queue. Defaults to status=pending_admin; pass ?status=… to filter."
  })
  async list(@Query() q: ListQueryDto) {
    const conds = [];
    if (q.status) {
      conds.push(eq(schema.transferRequests.status, q.status));
    } else {
      conds.push(eq(schema.transferRequests.status, "pending_admin"));
    }
    if (q.orgId) {
      conds.push(eq(schema.transferRequests.orgId, q.orgId));
    }
    const items = await this.db
      .select()
      .from(schema.transferRequests)
      .where(and(...conds))
      .orderBy(desc(schema.transferRequests.createdAt))
      .limit(100);
    return { items };
  }

  @Post("teams/transfer/:id/approve")
  @ApiOperation({
    summary:
      "Admin final approval. Atomically writes drop + add roster_moves, closes the source sub-invoice (refund assessment if paid), issues a destination sub-invoice, and notifies both captains."
  })
  async approve(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") transferId: string
  ) {
    const [tr] = await this.db
      .select()
      .from(schema.transferRequests)
      .where(eq(schema.transferRequests.id, transferId))
      .limit(1);
    if (!tr) throw new NotFoundException("Transfer not found");
    if (!isTransferState(tr.status)) {
      throw new ConflictException("Invalid state");
    }
    assertValidTransferTransition(tr.status, "approved");

    const result = await this.db.transaction(async (tx) => {
      // 1. roster_moves: drop on source
      const dropRows = await tx
        .insert(schema.rosterMoves)
        .values({
          teamId: tr.fromTeamId,
          personId: tr.personId,
          seasonId: tr.seasonId,
          moveType: "trade_out",
          membershipType: "primary",
          effectiveAt: new Date(),
          reason: `Transfer to ${tr.toTeamId}: ${tr.reason ?? ""}`.trim(),
          createdByUserId: user.userId,
          metadata: { transferId: tr.id, toTeamId: tr.toTeamId }
        })
        .returning();
      const dropMove = dropRows[0]!;

      // 2. team_memberships: source → released
      await tx
        .update(schema.teamMemberships)
        .set({
          currentStatus: "released",
          effectiveTo: new Date(),
          lastMoveId: dropMove.id,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(schema.teamMemberships.teamId, tr.fromTeamId),
            eq(schema.teamMemberships.personId, tr.personId),
            eq(schema.teamMemberships.seasonId, tr.seasonId),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );

      // 3. roster_moves: add on destination
      const addRows = await tx
        .insert(schema.rosterMoves)
        .values({
          teamId: tr.toTeamId,
          personId: tr.personId,
          seasonId: tr.seasonId,
          moveType: "trade_in",
          membershipType: "primary",
          effectiveAt: new Date(),
          createdByUserId: user.userId,
          metadata: { transferId: tr.id, fromTeamId: tr.fromTeamId }
        })
        .returning();
      const addMove = addRows[0]!;

      // 4. team_memberships: destination → active
      await tx.insert(schema.teamMemberships).values({
        teamId: tr.toTeamId,
        personId: tr.personId,
        seasonId: tr.seasonId,
        membershipType: "primary",
        effectiveFrom: new Date(),
        currentStatus: "active",
        lastMoveId: addMove.id
      });

      // 5. Source sub-invoice handling (locate via fromTeam's DTE +
      //    parent invoice + recipient_person).
      const [fromDte] = await tx
        .select({ invoiceId: schema.divisionTeamEntries.invoiceId })
        .from(schema.divisionTeamEntries)
        .innerJoin(
          schema.divisions,
          eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
        )
        .where(
          and(
            eq(schema.divisionTeamEntries.teamId, tr.fromTeamId),
            eq(schema.divisions.seasonId, tr.seasonId)
          )
        )
        .limit(1);
      if (fromDte?.invoiceId) {
        const [sub] = await tx
          .select()
          .from(schema.invoices)
          .where(
            and(
              eq(schema.invoices.parentInvoiceId, fromDte.invoiceId),
              eq(schema.invoices.recipientPersonId, tr.personId),
              eq(schema.invoices.invoiceType, "sub_invoice")
            )
          )
          .limit(1);
        if (sub) {
          if (sub.paidCents > 0) {
            await tx.insert(schema.refundAssessments).values({
              orgId: tr.orgId,
              teamId: tr.fromTeamId,
              seasonId: tr.seasonId,
              personId: tr.personId,
              sourceMoveId: dropMove.id,
              sourceEvent: "transfer",
              invoiceId: sub.id,
              paidCents: sub.paidCents,
              currency: sub.currency,
              status: "pending",
              metadata: { transferId: tr.id }
            });
          } else {
            await tx
              .update(schema.invoices)
              .set({ status: "void", updatedAt: new Date() })
              .where(eq(schema.invoices.id, sub.id));
          }
        }
      }

      // 6. Destination sub-invoice. Mirror the captain wizard's
      //    pattern — find the destination team's master invoice and
      //    fan out a new sub-invoice for this player. Defer pricing
      //    detail to a follow-up; create a $0 placeholder so the
      //    player has an invoice to pay against.
      const [toDte] = await tx
        .select({
          masterInvoiceId: schema.divisionTeamEntries.invoiceId,
          divisionId: schema.divisionTeamEntries.divisionId
        })
        .from(schema.divisionTeamEntries)
        .innerJoin(
          schema.divisions,
          eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
        )
        .where(
          and(
            eq(schema.divisionTeamEntries.teamId, tr.toTeamId),
            eq(schema.divisions.seasonId, tr.seasonId)
          )
        )
        .limit(1);

      let destinationInvoiceId: string | null = null;
      if (toDte?.masterInvoiceId) {
        const invRows = await tx
          .insert(schema.invoices)
          .values({
            orgId: tr.orgId,
            invoiceNumber: `INV-T-${Date.now().toString().slice(-9)}`,
            recipientPersonId: tr.personId,
            currency: "USD",
            subtotalCents: 0,
            totalCents: 0,
            status: "draft",
            invoiceType: "sub_invoice",
            parentInvoiceId: toDte.masterInvoiceId,
            issuedAt: new Date(),
            idempotencyKey: `transfer-sub-${tr.id}`,
            metadata: { transferId: tr.id }
          })
          .returning({ id: schema.invoices.id });
        destinationInvoiceId = invRows[0]?.id ?? null;
      }

      // 7. Flip transfer_requests
      const updated = await tx
        .update(schema.transferRequests)
        .set({
          status: "approved",
          approvedByUserId: user.userId,
          approvedAt: new Date(),
          destinationInvoiceId,
          updatedAt: new Date()
        })
        .where(eq(schema.transferRequests.id, transferId))
        .returning();

      return { transfer: updated[0]!, destinationInvoiceId };
    });

    void this.notify.queue({
      orgId: tr.orgId,
      templateCode: "TRANSFER_REQUEST",
      idempotencyKey: `transfer-approved-${tr.id}`,
      payload: {
        sourceTeam: tr.fromTeamId,
        playerName: tr.personId,
        transferId: tr.id
      }
    });

    return result;
  }

  @Post("teams/transfer/:id/reject")
  @ApiOperation({
    summary:
      "Admin rejects a pending transfer. Both captains notified; player stays on source team; no invoice changes."
  })
  async reject(
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
    if (!isTransferState(tr.status)) {
      throw new ConflictException("Invalid state");
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
}
