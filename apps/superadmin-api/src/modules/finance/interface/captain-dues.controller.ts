import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested
} from "class-validator";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { userIsCaptainOfTeam } from "../../../shared/auth/captain";
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

class SplitShareDto {
  /** Sub-invoice id (one player's share), as listed by GET /captain/dues/:teamId. */
  @IsUUID() invoiceId!: string;
  @IsInt() @Min(0) amountCents!: number;
}

class SetSplitBodyDto {
  @IsIn(["even", "custom"]) method!: "even" | "custom";
  /** even only: false gives the captain's own share 0 and splits across the rest. */
  @IsOptional() @IsBoolean() includeCaptain?: boolean;
  /** custom only: one entry per sub-invoice; must sum to the master total. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitShareDto)
  amounts?: SplitShareDto[];
}

type SplitMethod = "even" | "custom";

function readSplitMethod(metadata: unknown): SplitMethod | null {
  const m = (metadata as { splitMethod?: unknown } | null)?.splitMethod;
  return m === "even" || m === "custom" ? m : null;
}

function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      cents / 100
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Status of a player's share after its total changes. Issued shares
 * follow the money (paid / partial / back to sent); drafts and voids
 * are not re-issued here.
 */
function nextShareStatus(prev: string, totalCents: number, paidCents: number): string {
  if (prev === "draft" || prev === "void") return prev;
  if (totalCents === 0 || paidCents >= totalCents) return "paid";
  if (paidCents > 0) return "partial";
  return prev === "paid" || prev === "partial" ? "sent" : prev;
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
  private readonly logger = new Logger(CaptainDuesController.name);

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

    const { activeRow, masterInvoiceId } = await this.loadDuesContext(teamId);
    if (!masterInvoiceId) {
      return {
        teamId,
        teamName: team.name,
        masterInvoiceId: null,
        masterInvoiceNumber: null,
        masterTotalCents: 0,
        totalCents: 0,
        collectedCents: 0,
        thresholdCents: activeRow?.thresholdCents ?? 0,
        seasonName: activeRow?.seasonName ?? null,
        divisionName: activeRow?.divisionName ?? null,
        entryStatus: activeRow?.entryStatus ?? null,
        splitMethod: null as SplitMethod | null,
        subInvoices: []
      };
    }

    const [master] = await this.db
      .select({
        invoiceNumber: schema.invoices.invoiceNumber,
        totalCents: schema.invoices.totalCents,
        metadata: schema.invoices.metadata
      })
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
        preferredName: schema.persons.preferredName,
        personUserId: schema.persons.userId,
        profileDisplayName: schema.profiles.displayName
      })
      .from(schema.invoices)
      .leftJoin(
        schema.persons,
        eq(schema.persons.id, schema.invoices.recipientPersonId)
      )
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.id, schema.persons.userId)
      )
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
      masterTotalCents: master?.totalCents ?? totalCents,
      totalCents,
      collectedCents,
      thresholdCents: activeRow?.thresholdCents ?? 0,
      seasonName: activeRow?.seasonName ?? null,
      divisionName: activeRow?.divisionName ?? null,
      entryStatus: activeRow?.entryStatus ?? null,
      splitMethod: readSplitMethod(master?.metadata),
      subInvoices: subs.map((s) => {
        const isCaptain =
          !!s.personUserId && s.personUserId === team.captainUserId;
        const owe = Math.max(0, s.totalCents - s.paidCents);
        const overdue =
          owe > 0 && !!s.dueAt && new Date(s.dueAt as unknown as string) < now;
        const fullName = [s.firstName, s.lastName].filter(Boolean).join(" ");
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
            s.preferredName ||
            fullName ||
            s.profileDisplayName ||
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
    for (const s of subs) {
      if (s.paidCents >= s.totalCents) continue;
      await this.queueSubInvoiceReminder(team, s, "captain.dues_remind_all");
      queued++;
    }

    return { teamId, queued };
  }

  // -------------------------------------------------------------------
  // POST /captain/dues/:teamId/remind/:invoiceId
  // Per-player reminder. The dues screen used to call
  // /finance/splits/:id/remind with a sub-invoice id, which is a
  // different table, so every per-row Remind was a 404 (MON-7).
  // -------------------------------------------------------------------
  @Post(":teamId/remind/:invoiceId")
  @ApiOperation({
    summary:
      "Queue a payment reminder for one player's sub-invoice on this team. Idempotent per (invoice, day)."
  })
  async remindOne(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Param("invoiceId") invoiceId: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const masterId = await this.loadMasterInvoiceId(teamId);
    if (!masterId) {
      throw new NotFoundException("No master invoice for this team");
    }
    const [sub] = await this.db
      .select()
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.id, invoiceId),
          eq(schema.invoices.parentInvoiceId, masterId),
          eq(schema.invoices.invoiceType, "sub_invoice")
        )
      )
      .limit(1);
    if (!sub) throw new NotFoundException("Player share not found on this team");
    if (sub.paidCents >= sub.totalCents) {
      return { teamId, invoiceId, queued: 0 };
    }
    await this.queueSubInvoiceReminder(team, sub, "captain.dues_remind_one");
    return { teamId, invoiceId, queued: 1 };
  }

  private async queueSubInvoiceReminder(
    team: { orgId: string; name: string },
    s: typeof schema.invoices.$inferSelect,
    sourceEvent: string
  ) {
    const day = new Date().toISOString().slice(0, 10);
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
        sourceEvent,
        status: "queued"
      })
      .onConflictDoNothing({ target: schema.notifications.idempotencyKey });
  }

  // -------------------------------------------------------------------
  // POST /captain/dues/:teamId/split
  // Persist how the team fee is shared across the EXISTING sub-invoices
  // of the master the tracker shows (MON-8). The older
  // /finance/team-invoices/:id/split inserts a fresh set of sub-invoices
  // and is not what this screen reads. The server recomputes even
  // shares itself and refuses custom amounts that do not sum to the
  // master total or undercut what a player already paid.
  // -------------------------------------------------------------------
  @Post(":teamId/split")
  @ApiOperation({
    summary:
      "Set the dues split (even or custom) across the team's existing sub-invoices. Captain-only. Sum must equal the master invoice total; no share below its paid amount. Returns the fresh breakdown."
  })
  async setSplit(
    @CurrentUser() user: AuthPrincipal,
    @Param("teamId") teamId: string,
    @Body() body: SetSplitBodyDto
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const { masterInvoiceId } = await this.loadDuesContext(teamId);
    if (!masterInvoiceId) {
      throw new NotFoundException("No master invoice for this team");
    }

    const result = await this.db.transaction(async (tx) => {
      const [master] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, masterInvoiceId))
        .for("update");
      if (!master) throw new NotFoundException("Master invoice not found");
      if (master.status === "void") {
        throw new ConflictException({
          error: "master_void",
          message: "The team invoice was voided; there is nothing to split."
        });
      }

      const subRows = await tx
        .select({
          sub: schema.invoices,
          personUserId: schema.persons.userId,
          firstName: schema.persons.legalFirstName,
          lastName: schema.persons.legalLastName,
          preferredName: schema.persons.preferredName
        })
        .from(schema.invoices)
        .leftJoin(
          schema.persons,
          eq(schema.persons.id, schema.invoices.recipientPersonId)
        )
        .where(
          and(
            eq(schema.invoices.parentInvoiceId, master.id),
            eq(schema.invoices.invoiceType, "sub_invoice")
          )
        )
        .for("update", { of: schema.invoices });
      const shares = subRows
        .filter((r) => r.sub.status !== "void")
        .map((r) => ({
          ...r,
          isCaptain:
            !!r.personUserId && r.personUserId === team.captainUserId,
          label:
            r.preferredName ||
            [r.firstName, r.lastName].filter(Boolean).join(" ") ||
            r.sub.recipientEmail ||
            r.sub.invoiceNumber
        }));
      if (shares.length === 0) {
        throw new ConflictException({
          error: "no_shares",
          message: "No player shares exist on this team invoice yet."
        });
      }

      const target = master.totalCents;
      const currency = master.currency;
      const desired = new Map<string, number>();
      if (body.method === "even") {
        const includeCaptain = body.includeCaptain ?? true;
        const payers = includeCaptain
          ? shares
          : shares.filter((r) => !r.isCaptain);
        if (payers.length === 0) {
          throw new BadRequestException(
            "Nobody is left to split the fee across. Include the captain or add players first."
          );
        }
        const base = Math.floor(target / payers.length);
        const remainder = target - base * payers.length;
        for (const r of shares) desired.set(r.sub.id, 0);
        payers.forEach((r, i) =>
          desired.set(r.sub.id, base + (i === 0 ? remainder : 0))
        );
      } else {
        const amounts = body.amounts ?? [];
        if (amounts.length === 0) {
          throw new BadRequestException(
            "A custom split needs an amount for every player."
          );
        }
        for (const a of amounts) {
          if (desired.has(a.invoiceId)) {
            throw new BadRequestException(
              "Each player share may appear only once."
            );
          }
          if (!shares.some((r) => r.sub.id === a.invoiceId)) {
            throw new BadRequestException(
              "One of the shares is not on this team's invoice."
            );
          }
          desired.set(a.invoiceId, a.amountCents);
        }
        const missing = shares.filter((r) => !desired.has(r.sub.id));
        if (missing.length > 0) {
          throw new BadRequestException(
            `Every player share needs an amount (${missing.length} missing).`
          );
        }
        const sum = [...desired.values()].reduce((a, b) => a + b, 0);
        if (sum !== target) {
          throw new UnprocessableEntityException({
            error: "split_sum_mismatch",
            message: `Shares must add up to the team fee exactly: got ${fmtMoney(sum, currency)}, team fee is ${fmtMoney(target, currency)}.`,
            sumCents: sum,
            targetCents: target
          });
        }
      }

      for (const r of shares) {
        const amount = desired.get(r.sub.id) ?? 0;
        if (amount < r.sub.paidCents) {
          throw new UnprocessableEntityException({
            error: "below_paid",
            message: `${r.label} has already paid ${fmtMoney(r.sub.paidCents, currency)}; their share cannot be less than that.`,
            invoiceId: r.sub.id
          });
        }
      }

      const now = new Date();
      let invoicesUpdated = 0;
      let itemsUpdated = 0;
      let installmentsUpdated = 0;
      for (const r of shares) {
        const amount = desired.get(r.sub.id) ?? 0;
        if (amount === r.sub.totalCents) continue;
        const status = nextShareStatus(r.sub.status, amount, r.sub.paidCents);
        const updated = await tx
          .update(schema.invoices)
          .set({
            subtotalCents: amount,
            totalCents: amount,
            status,
            paidAt: status === "paid" ? r.sub.paidAt ?? now : null,
            updatedAt: now
          })
          .where(eq(schema.invoices.id, r.sub.id))
          .returning({ id: schema.invoices.id });
        invoicesUpdated += updated.length;

        // A share carries at most one "split share" line; keep it equal
        // to the new total so the invoice detail does not contradict it.
        const items = await tx
          .select({ id: schema.invoiceItems.id })
          .from(schema.invoiceItems)
          .where(eq(schema.invoiceItems.invoiceId, r.sub.id));
        if (items.length === 1) {
          await tx
            .update(schema.invoiceItems)
            .set({ quantity: 1, unitAmountCents: amount, amountCents: amount })
            .where(eq(schema.invoiceItems.id, items[0]!.id));
          itemsUpdated++;
        }

        installmentsUpdated += await this.rescaleInstallments(
          tx,
          r.sub.id,
          r.label,
          amount,
          currency,
          now
        );
      }

      const meta = (master.metadata as Record<string, unknown>) ?? {};
      await tx
        .update(schema.invoices)
        .set({
          metadata: {
            ...meta,
            splitConfigured: true,
            splitMethod: body.method,
            ...(body.method === "even"
              ? { splitIncludeCaptain: body.includeCaptain ?? true }
              : {}),
            splitUpdatedAt: now.toISOString(),
            splitUpdatedByUserId: user.userId
          },
          updatedAt: now
        })
        .where(eq(schema.invoices.id, master.id));

      return {
        shares: shares.length,
        invoicesUpdated,
        itemsUpdated,
        installmentsUpdated
      };
    });

    this.logger.log(
      `captain.dues.split team=${teamId} master=${masterInvoiceId} method=${body.method} shares=${result.shares} invoicesUpdated=${result.invoicesUpdated} items=${result.itemsUpdated} installments=${result.installmentsUpdated} by=${user.userId}`
    );
    // Readback: the tracker re-renders from what is now stored.
    return this.getBreakdown(user, teamId);
  }

  /**
   * Keep a share's payment plan equal to its new total. Charged or
   * charging instalments are fixed; open ones (scheduled, failed,
   * cancelled) absorb the difference evenly, remainder on the last.
   * Returns the number of instalment rows updated.
   */
  private async rescaleInstallments(
    tx: Pick<Database, "select" | "update">,
    invoiceId: string,
    label: string,
    newTotal: number,
    currency: string,
    now: Date
  ): Promise<number> {
    const rows = await tx
      .select()
      .from(schema.installmentSchedules)
      .where(eq(schema.installmentSchedules.invoiceId, invoiceId))
      .orderBy(schema.installmentSchedules.installmentNumber);
    if (rows.length === 0) return 0;
    const fixed = rows.filter(
      (r) => r.status === "succeeded" || r.status === "charging"
    );
    const open = rows.filter(
      (r) =>
        r.status === "scheduled" ||
        r.status === "failed" ||
        r.status === "cancelled"
    );
    const fixedSum = fixed.reduce((a, r) => a + r.amountCents, 0);
    const remaining = newTotal - fixedSum;
    if (remaining < 0) {
      throw new UnprocessableEntityException({
        error: "below_charged",
        message: `${label} already has ${fmtMoney(fixedSum, currency)} charged on a payment plan; their share cannot be less than that.`,
        invoiceId
      });
    }
    if (open.length === 0) {
      if (remaining === 0) return 0;
      throw new ConflictException({
        error: "plan_closed",
        message: `${label}'s payment plan has no open instalment left to carry the change. Ask the league admin to adjust it.`,
        invoiceId
      });
    }
    const per = Math.floor(remaining / open.length);
    const rem = remaining - per * open.length;
    let updated = 0;
    for (const [i, r] of open.entries()) {
      const amount = per + (i === open.length - 1 ? rem : 0);
      const status =
        amount === 0 ? "cancelled" : r.status === "cancelled" ? "scheduled" : r.status;
      await tx
        .update(schema.installmentSchedules)
        .set({ amountCents: amount, status, updatedAt: now })
        .where(eq(schema.installmentSchedules.id, r.id));
      updated++;
    }
    return updated;
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
    const ok = await userIsCaptainOfTeam(
      this.db,
      userId,
      teamId,
      team.captainUserId
    );
    if (!ok) throw new ForbiddenException("Not the captain of this team");
    return team;
  }

  /**
   * The master invoice the tracker shows: the team's earliest division
   * entry that carries one (plus that entry's season / division /
   * threshold context). Every captain dues command resolves the master
   * through here so reads and writes never disagree on which invoice
   * they mean.
   */
  private async loadDuesContext(teamId: string) {
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
    return { activeRow, masterInvoiceId: activeRow?.masterInvoiceId ?? null };
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
