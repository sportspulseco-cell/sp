import { formatMoney } from "@sportspulse/kernel";
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
  Query,
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
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
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
import { activeMemberPersonIds } from "../../../shared/audience/org-targets";
import { InvoiceNoticesService } from "../application/services/invoice-notices";
import { settleInstallments } from "../application/services/installments";

class CoverOutstandingBodyDto {
  @IsOptional()
  @IsIn(["succeeded", "failed"])
  mockOutcome?: "succeeded" | "failed";
  /** Which team invoice (default: the one the tracker opens on). */
  @IsOptional() @IsUUID() invoiceId?: string;
}

class PersonShareDto {
  @IsUUID() personId!: string;
  @IsInt() @Min(0) amountCents!: number;
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
  /** Which team invoice (default: the one the tracker opens on). */
  @IsOptional() @IsUUID() invoiceId?: string;
  /** custom, first split of an invoice with no shares yet: one entry per player. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonShareDto)
  personAmounts?: PersonShareDto[];
}

/** A team invoice the captain works on (MON-23). */
type DuesMaster = {
  id: string;
  invoiceNumber: string;
  totalCents: number;
  status: string;
  currency: string;
  /** division_entry: created when the team applied; team_invoice: sent by an admin. */
  kind: "division_entry" | "team_invoice";
  label: string;
  seasonName: string | null;
  divisionName: string | null;
  thresholdCents: number;
  entryStatus: string | null;
};

type SplitMethod = "even" | "custom";

function readSplitMethod(metadata: unknown): SplitMethod | null {
  const m = (metadata as { splitMethod?: unknown } | null)?.splitMethod;
  return m === "even" || m === "custom" ? m : null;
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
    @Inject(PAYMENT_PROCESSOR) private readonly processor: PaymentProcessor,
    private readonly notices: InvoiceNoticesService
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
    @Param("teamId") teamId: string,
    @Query("invoiceId") invoiceId?: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);

    const { masters, master: picked, lastEntry } = await this.resolveMaster(teamId, invoiceId);
    const mastersOut = masters.map((m) => ({
      id: m.id,
      invoiceNumber: m.invoiceNumber,
      totalCents: m.totalCents,
      kind: m.kind,
      label: m.label,
      status: m.status
    }));
    if (!picked) {
      return {
        teamId,
        teamName: team.name,
        masterInvoiceId: null,
        masterInvoiceNumber: null,
        masterTotalCents: 0,
        masterKind: null,
        masterLabel: null,
        totalCents: 0,
        collectedCents: 0,
        thresholdCents: lastEntry?.thresholdCents ?? 0,
        seasonName: lastEntry?.seasonName ?? null,
        divisionName: lastEntry?.divisionName ?? null,
        entryStatus: lastEntry?.entryStatus ?? null,
        splitMethod: null as SplitMethod | null,
        masters: mastersOut,
        candidates: [] as Array<{ personId: string; email: string | null; name: string; isCaptain: boolean }>,
        subInvoices: []
      };
    }
    const masterInvoiceId = picked.id;

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
      )
      // A fixed order (the share numbers -01, -02, ...). Without one,
      // Postgres returned the rows in storage order, which an update
      // changes, so the captain's rows jumped after saving a split.
      .orderBy(asc(schema.invoices.invoiceNumber));

    const totalCents = subs.reduce((a, s) => a + s.totalCents, 0);
    const collectedCents = subs.reduce((a, s) => a + s.paidCents, 0);
    const now = new Date();
    // No shares yet (a team invoice an admin sent): who the split can cover.
    const candidates = subs.length === 0 ? await this.splitCandidates(team) : [];

    return {
      teamId,
      teamName: team.name,
      masterInvoiceId,
      masterInvoiceNumber: master?.invoiceNumber ?? null,
      masterTotalCents: master?.totalCents ?? totalCents,
      masterKind: picked.kind,
      masterLabel: picked.label,
      totalCents,
      collectedCents,
      thresholdCents: picked.thresholdCents,
      seasonName: picked.seasonName,
      divisionName: picked.divisionName,
      entryStatus: picked.entryStatus,
      splitMethod: readSplitMethod(master?.metadata),
      masters: mastersOut,
      candidates,
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
    @Param("teamId") teamId: string,
    @Query("invoiceId") invoiceId?: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const masterId = (await this.resolveMaster(teamId, invoiceId)).master?.id ?? null;
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
    @Param("invoiceId") invoiceId: string,
    @Query("masterId") masterInvoiceId?: string
  ) {
    const team = await this.requireCaptainTeam(user.userId, teamId);
    const masterId = (await this.resolveMaster(teamId, masterInvoiceId)).master?.id ?? null;
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
    const masterInvoiceId = (await this.resolveMaster(teamId, body.invoiceId)).master?.id ?? null;
    if (!masterInvoiceId) {
      throw new NotFoundException("No master invoice for this team");
    }
    // Read outside the transaction: who a first split can cover.
    const candidates = await this.splitCandidates(team);

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
        // First split of a team invoice an admin sent (UC-16, MON-23):
        // create each player's invoice for their share.
        const created = await this.createShares(tx, master, body, candidates, user.userId);
        return { shares: created.length, invoicesUpdated: 0, itemsUpdated: 0, installmentsUpdated: 0, created };
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
            message: `Shares must add up to the team fee exactly: got ${formatMoney(sum, currency)}, team fee is ${formatMoney(target, currency)}.`,
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
            message: `${r.label} has already paid ${formatMoney(r.sub.paidCents, currency)}; their share cannot be less than that.`,
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
        installmentsUpdated,
        created: [] as string[]
      };
    });

    this.logger.log(
      `captain.dues.split team=${teamId} master=${masterInvoiceId} method=${body.method} shares=${result.shares} created=${result.created.length} invoicesUpdated=${result.invoicesUpdated} items=${result.itemsUpdated} installments=${result.installmentsUpdated} by=${user.userId}`
    );
    // Each player hears about their new share (after commit).
    if (result.created.length > 0) await this.notices.issued(result.created);
    // Readback: the tracker re-renders from what is now stored.
    return this.getBreakdown(user, teamId, masterInvoiceId);
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
        message: `${label} already has ${formatMoney(fixedSum, currency)} charged on a payment plan; their share cannot be less than that.`,
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
    const masterId = (await this.resolveMaster(teamId, body.invoiceId)).master?.id ?? null;
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
        await settleInstallments(tx, o.invoice.id);

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
   * Every team invoice the captain works on (MON-23): the master of each
   * division entry (made when the team applied) and each team invoice an
   * admin sent from the composer. Every dues command resolves its invoice
   * here, so reads and writes never disagree on which one they mean.
   */
  private async loadMasters(teamId: string) {
    const entries = await this.db
      .select({
        invoiceId: schema.divisionTeamEntries.invoiceId,
        thresholdCents: schema.divisionTeamEntries.confirmationThresholdCents,
        entryStatus: schema.divisionTeamEntries.entryStatus,
        seasonName: schema.seasons.name,
        divisionName: schema.divisions.name
      })
      .from(schema.divisionTeamEntries)
      .innerJoin(schema.divisions, eq(schema.divisions.id, schema.divisionTeamEntries.divisionId))
      .innerJoin(schema.seasons, eq(schema.seasons.id, schema.divisions.seasonId))
      .where(eq(schema.divisionTeamEntries.teamId, teamId))
      .orderBy(schema.divisionTeamEntries.createdAt);
    const entryIds = entries.map((e) => e.invoiceId).filter((x): x is string => !!x);
    const invoiceCols = {
      id: schema.invoices.id,
      invoiceNumber: schema.invoices.invoiceNumber,
      totalCents: schema.invoices.totalCents,
      status: schema.invoices.status,
      currency: schema.invoices.currency
    };
    const entryInvoices = entryIds.length
      ? await this.db.select(invoiceCols).from(schema.invoices).where(inArray(schema.invoices.id, entryIds))
      : [];
    const teamInvoices = await this.db
      .select(invoiceCols)
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.teamId, teamId),
          eq(schema.invoices.invoiceType, "team_dues"),
          ne(schema.invoices.status, "void")
        )
      )
      .orderBy(desc(schema.invoices.createdAt));
    const sent = teamInvoices.filter((t) => !entryIds.includes(t.id));
    const items = sent.length
      ? await this.db
          .select({ invoiceId: schema.invoiceItems.invoiceId, description: schema.invoiceItems.description })
          .from(schema.invoiceItems)
          .where(inArray(schema.invoiceItems.invoiceId, sent.map((t) => t.id)))
      : [];

    const masters: DuesMaster[] = [];
    for (const e of entries) {
      const inv = entryInvoices.find((i) => i.id === e.invoiceId);
      if (!inv) continue;
      masters.push({
        ...inv,
        kind: "division_entry",
        label: [e.seasonName, e.divisionName].filter(Boolean).join(" · ") || inv.invoiceNumber,
        seasonName: e.seasonName,
        divisionName: e.divisionName,
        thresholdCents: e.thresholdCents ?? 0,
        entryStatus: e.entryStatus
      });
    }
    for (const t of sent) {
      masters.push({
        ...t,
        kind: "team_invoice",
        label: items.find((i) => i.invoiceId === t.id)?.description ?? t.invoiceNumber,
        seasonName: null,
        divisionName: null,
        thresholdCents: 0,
        entryStatus: null
      });
    }
    return { masters, lastEntry: entries.at(-1) ?? null };
  }

  /** The invoice asked for (404 when it is not this team's), else the first one. */
  private async resolveMaster(teamId: string, invoiceId?: string) {
    const { masters, lastEntry } = await this.loadMasters(teamId);
    if (invoiceId) {
      const picked = masters.find((m) => m.id === invoiceId);
      if (!picked) throw new NotFoundException("That team invoice is not on this team");
      return { masters, master: picked, lastEntry };
    }
    return { masters, master: masters[0] ?? null, lastEntry };
  }

  /**
   * Who a first split covers: the team's active roster plus the captain
   * (captains are not always rostered, and pay their share by default).
   */
  private async splitCandidates(team: { id: string; captainUserId: string | null }) {
    const ids = new Set(await activeMemberPersonIds(this.db, [team.id]));
    let captainPersonId: string | null = null;
    if (team.captainUserId) {
      const [c] = await this.db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(eq(schema.persons.userId, team.captainUserId))
        .limit(1);
      captainPersonId = c?.id ?? null;
      if (captainPersonId) ids.add(captainPersonId);
    }
    if (ids.size === 0) return [];
    const people = await this.db
      .select({
        personId: schema.persons.id,
        firstName: schema.persons.legalFirstName,
        lastName: schema.persons.legalLastName,
        preferredName: schema.persons.preferredName,
        email: schema.profiles.email
      })
      .from(schema.persons)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(inArray(schema.persons.id, [...ids]));
    return people
      .map((p) => ({
        personId: p.personId,
        email: p.email ?? null,
        name: p.preferredName || [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "Player",
        isCaptain: p.personId === captainPersonId
      }))
      .sort((a, b) => Number(b.isCaptain) - Number(a.isCaptain) || a.name.localeCompare(b.name));
  }

  /**
   * First split of a team invoice with no shares (UC-16): one invoice per
   * player for their share, issued now. The team invoice becomes the
   * container its shares roll up to (status draft, like a division-entry
   * master), so it is not billed, chased or counted twice.
   */
  private async createShares(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    master: typeof schema.invoices.$inferSelect,
    body: SetSplitBodyDto,
    candidates: Array<{ personId: string; email: string | null; name: string; isCaptain: boolean }>,
    userId: string
  ): Promise<string[]> {
    if (master.paidCents > 0) {
      throw new ConflictException({
        error: "master_paid",
        message: `${formatMoney(master.paidCents, master.currency)} is already paid on this team invoice. Ask your league admin before splitting it.`
      });
    }
    const target = master.totalCents;
    const amounts = new Map<string, number>();
    if (body.method === "even") {
      const includeCaptain = body.includeCaptain ?? true;
      const payers = includeCaptain ? candidates : candidates.filter((c) => !c.isCaptain);
      if (payers.length === 0) {
        throw new BadRequestException(
          "Nobody is on the roster to split the fee across. Invite players first, or include yourself."
        );
      }
      const base = Math.floor(target / payers.length);
      const remainder = target - base * payers.length;
      payers.forEach((c, i) => amounts.set(c.personId, base + (i === 0 ? remainder : 0)));
    } else {
      for (const a of body.personAmounts ?? []) {
        if (amounts.has(a.personId)) throw new BadRequestException("Each player may appear only once.");
        if (!candidates.some((c) => c.personId === a.personId)) {
          throw new BadRequestException("One of the players is not on this team.");
        }
        amounts.set(a.personId, a.amountCents);
      }
      if (amounts.size === 0) throw new BadRequestException("A custom split needs an amount for at least one player.");
      const sum = [...amounts.values()].reduce((a, b) => a + b, 0);
      if (sum !== target) {
        throw new UnprocessableEntityException({
          error: "split_sum_mismatch",
          message: `Shares must add up to the team fee exactly: got ${formatMoney(sum, master.currency)}, team fee is ${formatMoney(target, master.currency)}.`,
          sumCents: sum,
          targetCents: target
        });
      }
    }

    const [firstItem] = await tx
      .select({ kind: schema.invoiceItems.kind })
      .from(schema.invoiceItems)
      .where(eq(schema.invoiceItems.invoiceId, master.id))
      .limit(1);
    const now = new Date();
    // Two statements for the whole roster (shares, then their line items):
    // one insert per player took over 30 s for a 26-player team.
    const payers = candidates
      .map((c) => ({ c, amount: amounts.get(c.personId) ?? 0 }))
      .filter((x) => x.amount > 0);
    if (payers.length === 0) throw new BadRequestException("Nothing to split: the team fee is $0.");
    const subs = await tx
      .insert(schema.invoices)
      .values(
        payers.map(({ c, amount }, i) => ({
          orgId: master.orgId,
          invoiceNumber: `${master.invoiceNumber}-${String(i + 1).padStart(2, "0")}`,
          invoiceType: "sub_invoice" as const,
          parentInvoiceId: master.id,
          billingScope: "individual",
          teamId: master.teamId,
          recipientPersonId: c.personId,
          recipientEmail: c.email,
          subtotalCents: amount,
          totalCents: amount,
          paidCents: 0,
          currency: master.currency,
          status: "sent",
          issuedAt: now,
          dueAt: master.dueAt,
          idempotencyKey: `share-${master.id}-${c.personId}`,
          metadata: { splitMethod: body.method }
        }))
      )
      .returning({ id: schema.invoices.id, totalCents: schema.invoices.totalCents });
    if (subs.length !== payers.length) {
      throw new Error(`share insert wrote ${subs.length} of ${payers.length} rows`);
    }
    await tx.insert(schema.invoiceItems).values(
      subs.map((sub) => ({
        invoiceId: sub.id,
        kind: firstItem?.kind ?? "registration_fee",
        description: `${master.invoiceNumber}: your share`,
        quantity: 1,
        unitAmountCents: sub.totalCents,
        amountCents: sub.totalCents
      }))
    );
    const created = subs.map((s) => s.id);
    const meta = (master.metadata as Record<string, unknown>) ?? {};
    await tx
      .update(schema.invoices)
      .set({
        status: "draft",
        metadata: {
          ...meta,
          splitConfigured: true,
          splitMethod: body.method,
          ...(body.method === "even" ? { splitIncludeCaptain: body.includeCaptain ?? true } : {}),
          sharesCreatedAt: now.toISOString(),
          splitUpdatedAt: now.toISOString(),
          splitUpdatedByUserId: userId
        },
        updatedAt: now
      })
      .where(eq(schema.invoices.id, master.id));
    return created;
  }

}
