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
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { orgVisible, unrestricted } from "../../../shared/auth/visibility";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { NotificationService } from "../../communications/application/notification.service";
import { notifyTransfer } from "../application/transfer-notices";
import { withTransferNames } from "../application/transfer-names";
import { reserveInvoiceNumbers } from "../../finance/application/services/invoice-number";

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
// Reads: super admin or a scoped admin (their orgs). Writes: super admin only.
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
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
  async list(@Query() q: ListQueryDto, @UserScope() scope: UserScopeType) {
    const conds = [];
    if (q.orgId && !orgVisible(scope, q.orgId)) return { items: [] };
    if (!unrestricted(scope)) {
      conds.push(
        scope.orgIds?.length
          ? inArray(schema.transferRequests.orgId, scope.orgIds)
          : sql`false`
      );
    }
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
    // Person + team names so the queue never prints raw ids.
    return { items: await withTransferNames(this.db, items) };
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
        // A team entered in two divisions of the season has two entries;
        // the one with the team invoice is the one to settle against.
        .orderBy(sql`${schema.divisionTeamEntries.invoiceId} IS NULL`)
        .limit(1);

      // Capture pricing context so we can carry it to the destination.
      let sourceAllocatedCents = 0;
      let sourcePaidCents = 0;
      let sourceCurrency = "USD";

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
          sourceAllocatedCents = sub.totalCents;
          sourcePaidCents = sub.paidCents;
          sourceCurrency = sub.currency;
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

      // 6. Destination sub-invoice. Carry the source's unpaid balance —
      //    "you owed X on team A and paid Y; you owe X-Y on team B."
      //    The refund_assessments row above handles the case where the
      //    player overpaid relative to time-on-roster.
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
        .orderBy(sql`${schema.divisionTeamEntries.invoiceId} IS NULL`)
        .limit(1);

      let destinationInvoiceId: string | null = null;
      if (toDte?.masterInvoiceId) {
        const destinationAmount = Math.max(
          0,
          sourceAllocatedCents - sourcePaidCents
        );
        // The org sequence (MON-25), not the clock: numbers stay in order
        // and two approvals in one millisecond cannot collide.
        const [invoiceNumber] = await reserveInvoiceNumbers(tx, tr.orgId, 1);
        const invRows = await tx
          .insert(schema.invoices)
          .values({
            orgId: tr.orgId,
            invoiceNumber: invoiceNumber!,
            recipientPersonId: tr.personId,
            currency: sourceCurrency,
            subtotalCents: destinationAmount,
            totalCents: destinationAmount,
            status: destinationAmount === 0 ? "paid" : "draft",
            invoiceType: "sub_invoice",
            parentInvoiceId: toDte.masterInvoiceId,
            issuedAt: new Date(),
            idempotencyKey: `transfer-sub-${tr.id}`,
            metadata: {
              transferId: tr.id,
              carriedFromTeamId: tr.fromTeamId,
              sourceAllocatedCents,
              sourcePaidCents
            }
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

    // The player and both captains (COMP-19: this reused the request
    // template, named no recipient and printed ids).
    await notifyTransfer(this.db, this.notify, {
      transfer: tr,
      templateCode: "TRANSFER_APPROVED",
      key: `transfer-approved-${tr.id}`,
      toPlayer: true,
      captainsOf: ["from", "to"]
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

    await notifyTransfer(this.db, this.notify, {
      transfer: tr,
      templateCode: "TRANSFER_REJECTED",
      key: `transfer-rejected-${tr.id}`,
      toPlayer: true,
      captainsOf: ["from", "to"],
      extra: { reason: body.reason.trim() }
    });

    return { transfer: updated[0]! };
  }
}
