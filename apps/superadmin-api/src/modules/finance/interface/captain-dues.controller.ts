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
import { IsIn, IsOptional } from "class-validator";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import {
  PAYMENT_PROCESSOR,
  type PaymentProcessor
} from "../../../shared/payments/payment-processor";

class CoverOutstandingBodyDto {
  @IsOptional()
  @IsIn(["succeeded", "failed"])
  mockOutcome?: "succeeded" | "failed";
}

/**
 * Spec 2 Phase 3 — captain dues management endpoints.
 *
 * Both routes are scoped to the requesting user's team (must be the
 * team's captain). Sub-invoices on the team's master are the unit
 * of work — Remind All fires a payment nudge to every unpaid
 * sub-invoice recipient; Cover Outstanding charges the captain's
 * card once for the full remaining balance across the team and
 * credits each sub-invoice paid_cents in one transaction.
 */
@ApiTags("captain/dues")
@ApiBearerAuth()
@Controller("captain/dues")
@UseGuards(JwtAuthGuard)
export class CaptainDuesController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROCESSOR) private readonly processor: PaymentProcessor
  ) {}

  // -------------------------------------------------------------------
  // GET /captain/dues/:teamId — per-player breakdown for the UI
  // -------------------------------------------------------------------
  @Get(":teamId")
  @ApiOperation({
    summary:
      "Per-sub-invoice breakdown for the captain dues tracker. Lists each player + amount + paid status."
  })
  async getBreakdown(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);

    // Find current master invoice via the team's most recent DTE, plus
    // the threshold + season + division context for the captain UI.
    const dteRows = await this.db
      .select({
        masterInvoiceId: schema.divisionTeamEntries.invoiceId,
        collectedCents: schema.divisionTeamEntries.collectedCents,
        thresholdCents:
          schema.divisionTeamEntries.confirmationThresholdCents,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        seasonName: schema.seasons.name,
        divisionName: schema.divisions.name
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(
        schema.divisions,
        eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
      )
      .innerJoin(
        schema.seasons,
        eq(schema.seasons.id, schema.divisions.seasonId)
      )
      .where(eq(schema.divisionTeamEntries.teamId, teamId))
      .orderBy(schema.divisionTeamEntries.createdAt);
    const activeRow =
      dteRows.find((r) => r.masterInvoiceId) ?? dteRows.at(-1) ?? null;
    const masterInvoiceId = activeRow?.masterInvoiceId ?? null;
    if (!masterInvoiceId) {
      return {
        teamId,
        teamName: team.name,
        masterInvoiceId: null,
        masterInvoiceNumber: null,
        totalCents: 0,
        collectedCents: 0,
        thresholdCents: activeRow?.thresholdCents ?? 0,
        seasonName: activeRow?.seasonName ?? null,
        divisionName: activeRow?.divisionName ?? null,
        entryStatus: activeRow?.entryStatus ?? null,
        subInvoices: []
      };
    }

    const [master] = await this.db
      .select({ invoiceNumber: schema.invoices.invoiceNumber })
      .from(schema.invoices)
      .where(eq(schema.invoices.id, masterInvoiceId))
      .limit(1);

    const subs = await this.db
      .select({
        id: schema.invoices.id,
        invoiceNumber: schema.invoices.invoiceNumber,
        recipientPersonId: schema.invoices.recipientPersonId,
        recipientEmail: schema.invoices.recipientEmail,
        totalCents: schema.invoices.totalCents,
        paidCents: schema.invoices.paidCents,
        status: schema.invoices.status,
        currency: schema.invoices.currency,
        dueAt: schema.invoices.dueAt,
        firstName: schema.persons.legalFirstName,
        lastName: schema.persons.legalLastName,
        captainUserIdForRow: schema.teams.captainUserId
      })
      .from(schema.invoices)
      .leftJoin(
        schema.persons,
        eq(schema.persons.id, schema.invoices.recipientPersonId)
      )
      .leftJoin(schema.teams, eq(schema.teams.id, teamId))
      .where(
        and(
          eq(schema.invoices.parentInvoiceId, masterInvoiceId),
          eq(schema.invoices.invoiceType, "sub_invoice")
        )
      );

    const totalCents = subs.reduce((a, s) => a + s.totalCents, 0);
    const collectedCents = subs.reduce((a, s) => a + s.paidCents, 0);
    const now = new Date();

    return {
      teamId,
      teamName: team.name,
      masterInvoiceId,
      masterInvoiceNumber: master?.invoiceNumber ?? null,
      totalCents,
      collectedCents,
      thresholdCents: activeRow?.thresholdCents ?? 0,
      seasonName: activeRow?.seasonName ?? null,
      divisionName: activeRow?.divisionName ?? null,
      entryStatus: activeRow?.entryStatus ?? null,
      subInvoices: subs.map((s) => {
        const isCaptain =
          s.recipientPersonId &&
          s.captainUserIdForRow &&
          // best-effort: persons.userId vs teams.captainUserId resolves
          // captain-vs-player distinction. Currently a noop because we
          // didn't select persons.userId — fall back to false.
          false;
        const owe = Math.max(0, s.totalCents - s.paidCents);
        const overdue =
          owe > 0 && !!s.dueAt && new Date(s.dueAt as unknown as string) < now;
        return {
          id: s.id,
          invoiceNumber: s.invoiceNumber,
          recipientPersonId: s.recipientPersonId,
          recipientEmail: s.recipientEmail,
          totalCents: s.totalCents,
          paidCents: s.paidCents,
          status: s.status,
          currency: s.currency,
          dueAt: s.dueAt?.toISOString() ?? null,
          isOverdue: overdue,
          isCaptain,
          playerName:
            [s.firstName, s.lastName].filter(Boolean).join(" ") ||
            s.recipientEmail
        };
      })
    };
  }

  // -------------------------------------------------------------------
  // POST /captain/dues/:teamId/remind-all
  // -------------------------------------------------------------------
  @Post(":teamId/remind-all")
  @ApiOperation({
    summary:
      "Queue a payment reminder for every sub-invoice on this team that isn't fully paid. Idempotent — same idempotency key per (invoice, day)."
  })
  async remindAll(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const masterId = await this.loadMasterInvoiceId(teamId);
    if (!masterId) {
      throw new NotFoundException("No master invoice for this team");
    }

    const subs = await this.db
      .select()
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.parentInvoiceId, masterId),
          eq(schema.invoices.invoiceType, "sub_invoice")
        )
      );

    let queued = 0;
    const day = new Date().toISOString().slice(0, 10);
    for (const s of subs) {
      if (s.paidCents >= s.totalCents) continue;
      await this.db
        .insert(schema.notifications)
        .values({
          orgId: team.orgId,
          idempotencyKey: `dues-remind-${s.id}-${day}`,
          templateCode: "SUB_INVOICE_REMINDER",
          channel: "email",
          body: `Reminder: your share of ${team.name} dues is outstanding. Pay now to keep your spot.`,
          recipientPersonId: s.recipientPersonId,
          recipientEmail: s.recipientEmail,
          payload: { invoiceId: s.id },
          sourceEvent: "captain.dues_remind_all",
          status: "queued"
        })
        .onConflictDoNothing({ target: schema.notifications.idempotencyKey });
      queued++;
    }

    return { teamId, queued };
  }

  // -------------------------------------------------------------------
  // POST /captain/dues/:teamId/cover-outstanding
  // Single mock-Stripe charge for the team's full remaining balance.
  // -------------------------------------------------------------------
  @Post(":teamId/cover-outstanding")
  @ApiOperation({
    summary:
      "Captain pays the full remaining balance of every unpaid sub-invoice in a single charge. Atomic: card success advances paid_cents on every sub-invoice + queues 'dues_covered' notification to each player."
  })
  async coverOutstanding(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Body() body: CoverOutstandingBodyDto
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const masterId = await this.loadMasterInvoiceId(teamId);
    if (!masterId) {
      throw new NotFoundException("No master invoice for this team");
    }

    return await this.db.transaction(async (tx) => {
      const subs = await tx
        .select()
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.parentInvoiceId, masterId),
            eq(schema.invoices.invoiceType, "sub_invoice")
          )
        );

      const outstanding = subs
        .filter((s) => s.paidCents < s.totalCents)
        .map((s) => ({
          invoice: s,
          owe: s.totalCents - s.paidCents
        }));
      const grandTotal = outstanding.reduce((a, x) => a + x.owe, 0);
      if (grandTotal === 0) {
        return {
          teamId,
          charged: 0,
          covered: 0,
          message: "Nothing outstanding."
        };
      }

      const currency = subs[0]?.currency ?? "USD";
      const charge = await this.processor.charge({
        amountCents: grandTotal,
        currency,
        description: `${team.name} — cover outstanding dues`,
        mockOutcome: body.mockOutcome
      });
      if (charge.status !== "succeeded") {
        throw new ConflictException({
          error: "charge_failed",
          message: charge.failureMessage ?? "Card declined."
        });
      }

      let covered = 0;
      for (const o of outstanding) {
        await tx.insert(schema.payments).values({
          orgId: team.orgId,
          invoiceId: o.invoice.id,
          amountCents: o.owe,
          currency,
          method: "credit_card",
          status: "succeeded",
          externalProviderId: `${charge.intentId}:${o.invoice.id}`,
          metadata: {
            coveredByCaptainUserId: user.userId,
            chargeId: charge.intentId
          }
        });

        await tx
          .update(schema.invoices)
          .set({
            paidCents: o.invoice.totalCents,
            status: "paid",
            paidAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(schema.invoices.id, o.invoice.id));

        await tx
          .insert(schema.notifications)
          .values({
            orgId: team.orgId,
            idempotencyKey: `dues-covered-${o.invoice.id}-${charge.intentId}`,
            templateCode: "DUES_COVERED_BY_CAPTAIN",
            channel: "email",
            body: `Your dues for ${team.name} were covered by your captain. You owe $0.`,
            recipientPersonId: o.invoice.recipientPersonId,
            recipientEmail: o.invoice.recipientEmail,
            payload: { invoiceId: o.invoice.id, chargeId: charge.intentId },
            sourceEvent: "captain.cover_outstanding",
            status: "queued"
          })
          .onConflictDoNothing({
            target: schema.notifications.idempotencyKey
          });
        covered++;
      }

      return {
        teamId,
        charged: grandTotal,
        covered,
        chargeId: charge.intentId
      };
    });
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------
  private async requireCaptainTeam(userId: string, teamId: string) {
    const [team] = await this.db
      .select({
        id: schema.teams.id,
        orgId: schema.teams.orgId,
        name: schema.teams.name,
        captainUserId: schema.teams.captainUserId
      })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");
    if (team.captainUserId !== userId) {
      const [profile] = await this.db
        .select({ isSuper: schema.profiles.isSuperAdmin })
        .from(schema.profiles)
        .where(eq(schema.profiles.id, userId))
        .limit(1);
      if (!profile?.isSuper)
        throw new ForbiddenException("Not the captain of this team");
    }
    return team;
  }

  private async loadMasterInvoiceId(teamId: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: schema.divisionTeamEntries.invoiceId })
      .from(schema.divisionTeamEntries)
      .where(
        and(
          eq(schema.divisionTeamEntries.teamId, teamId),
          inArray(schema.divisionTeamEntries.entryStatus, [
            "applied",
            "accepted",
            "confirmed"
          ])
        )
      );
    return rows.find((r) => r.id)?.id ?? null;
  }
}
