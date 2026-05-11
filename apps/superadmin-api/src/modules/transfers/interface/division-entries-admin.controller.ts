import {
  Body,
  ConflictException,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import { and, eq } from "drizzle-orm";
import { ROSTER_DROP_REASON_MIN_CHARS } from "@sportspulse/kernel";
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

/**
 * Workflow 7B · Case 9 — admin rejects a team's division application.
 *
 * Master + sub invoices are voided; refund_assessments rows are
 * spawned for any sub-invoice that had collected payments. Captain
 * is notified with the reason and can re-apply to a different
 * division through the rollover wizard.
 */
@ApiTags("league/admin/division-team-entries")
@ApiBearerAuth()
@Controller("league/division-team-entries")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class DivisionEntriesAdminController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService
  ) {}

  @Post(":id/reject")
  @ApiOperation({
    summary:
      "Reject a team's division application. Voids master + sub invoices, spawns refund_assessments for any paid sub-invoice, and notifies the captain."
  })
  async reject(
    @CurrentUser() user: AuthPrincipal,
    @Param("id") entryId: string,
    @Body() body: RejectBodyDto
  ) {
    const [entry] = await this.db
      .select({
        id: schema.divisionTeamEntries.id,
        teamId: schema.divisionTeamEntries.teamId,
        divisionId: schema.divisionTeamEntries.divisionId,
        invoiceId: schema.divisionTeamEntries.invoiceId,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        metadata: schema.divisionTeamEntries.metadata
      })
      .from(schema.divisionTeamEntries)
      .where(eq(schema.divisionTeamEntries.id, entryId))
      .limit(1);
    if (!entry) throw new NotFoundException("Entry not found");
    if (entry.entryStatus === "rejected") {
      throw new ConflictException("Entry is already rejected");
    }

    const [division] = await this.db
      .select({
        id: schema.divisions.id,
        name: schema.divisions.name,
        seasonId: schema.divisions.seasonId
      })
      .from(schema.divisions)
      .where(eq(schema.divisions.id, entry.divisionId))
      .limit(1);
    if (!division) throw new NotFoundException("Division not found");

    const [team] = await this.db
      .select({
        id: schema.teams.id,
        name: schema.teams.name,
        orgId: schema.teams.orgId
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, entry.teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    await this.db.transaction(async (tx) => {
      // 1. Flip DTE
      const existingMetadata =
        (entry.metadata as Record<string, unknown>) ?? {};
      await tx
        .update(schema.divisionTeamEntries)
        .set({
          entryStatus: "rejected",
          metadata: {
            ...existingMetadata,
            rejectionReason: body.reason.trim(),
            rejectedAt: new Date().toISOString(),
            rejectedByUserId: user.userId
          }
        })
        .where(eq(schema.divisionTeamEntries.id, entryId));

      if (entry.invoiceId) {
        // 2. Identify sub-invoices and decide refund vs void
        const subs = await tx
          .select()
          .from(schema.invoices)
          .where(eq(schema.invoices.parentInvoiceId, entry.invoiceId));
        for (const sub of subs) {
          if (sub.paidCents > 0 && sub.recipientPersonId) {
            await tx.insert(schema.refundAssessments).values({
              orgId: team.orgId,
              teamId: team.id,
              seasonId: division.seasonId,
              personId: sub.recipientPersonId,
              sourceEvent: "division_rejected",
              invoiceId: sub.id,
              paidCents: sub.paidCents,
              currency: sub.currency,
              status: "pending",
              metadata: { entryId, reason: body.reason.trim() }
            });
          }
          await tx
            .update(schema.invoices)
            .set({ status: "void", updatedAt: new Date() })
            .where(eq(schema.invoices.id, sub.id));
        }

        // 3. Void the master
        await tx
          .update(schema.invoices)
          .set({ status: "void", updatedAt: new Date() })
          .where(eq(schema.invoices.id, entry.invoiceId));
      }
    });

    void this.notify.queue({
      orgId: team.orgId,
      templateCode: "DIVISION_APPLICATION_REJECTED",
      idempotencyKey: `division-rejected-${entryId}`,
      payload: {
        teamName: team.name,
        divisionName: division.name,
        reason: body.reason.trim()
      }
    });

    return { entryId, status: "rejected" as const };
  }
}
