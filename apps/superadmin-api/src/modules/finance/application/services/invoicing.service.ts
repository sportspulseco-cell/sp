import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { eq, ilike, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { personInOrg } from "../../../../shared/auth/visibility";
import { InvoiceNoticesService } from "./invoice-notices";
import {
  activeMemberPersonIds,
  ORG_TARGET_TYPES,
  type OrgTargetType,
  teamIdsInTarget
} from "../../../../shared/audience/org-targets";
import type { BulkCreateInvoiceBodyDto } from "../../interface/dto/bulk-invoice.dto";
import { reserveInvoiceNumbers } from "./invoice-number";
import { invoiceLineTotals, signedLineAmount } from "@sportspulse/kernel";

/**
 * Bulk invoice creation extracted from FinanceInvoicingController so the
 * sa-only controller and the org-admin proxy can both delegate to a
 * single implementation. Cardinal rule: one source of truth for the
 * fan-out + insert + payment-plan logic — never two.
 */
@Injectable()
export class InvoicingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notices: InvoiceNoticesService
  ) {}

  /**
   * Create one or more invoices from a billing-scope target.
   * Idempotent on `idempotencyKey`. Returns the inserted rows plus the
   * bulkJobId (null for single-person scope).
   */
  async createBulkInvoice(
    idempotencyKey: string,
    body: BulkCreateInvoiceBodyDto
  ): Promise<{
    invoices: (typeof schema.invoices.$inferSelect)[];
    bulkJobId: string | null;
    count: number;
    idempotent?: boolean;
  }> {
    if (!idempotencyKey) {
      throw new BadRequestException("X-Idempotency-Key header is required");
    }

    // Idempotency short-circuit
    const existing = await this.db
      .select()
      .from(schema.invoices)
      .where(
        or(
          eq(schema.invoices.idempotencyKey, idempotencyKey),
          ilike(schema.invoices.idempotencyKey, `${idempotencyKey}-%`)
        )!
      );
    if (existing.length > 0) {
      return {
        invoices: existing,
        bulkJobId: existing[0]?.bulkJobId ?? null,
        count: existing.length,
        idempotent: true
      };
    }

    const [org] = await this.db
      .select()
      .from(schema.orgs)
      .where(eq(schema.orgs.id, body.orgId))
      .limit(1);
    if (!org) throw new NotFoundException("Org not found");

    // MON-23 / UC-16: a Team invoice is the team's full fee, sent to the
    // captain, who splits it among the players on Dues. Every other
    // scope bills each member directly.
    const teamInvoice = body.billingScope === "team";
    if (teamInvoice && body.paymentPlanEnabled) {
      throw new BadRequestException(
        "Payment plans go on the players' shares. Create the team invoice without one; the captain splits it on Dues."
      );
    }
    const personIds = teamInvoice
      ? [await this.teamCaptainPersonId(body.targetId, body.orgId)]
      : await this.resolveScopeTargets(body.billingScope, body.targetId, body.orgId);
    if (personIds.length === 0) {
      throw new BadRequestException(
        "No active members found for the selected target."
      );
    }

    // A "discount" line takes its amount off the charges (kernel
    // invoiceLineTotals). Before, every line was added, so a $100 fee
    // with a $10 discount billed $110. A discount larger than the
    // charges is refused: a total never goes below zero.
    const totals = invoiceLineTotals(body.items);
    if (!totals.ok) throw new BadRequestException(totals.reason);
    const subtotalCents = totals.chargesCents;
    const discountCents = totals.discountCents;
    const totalCents = totals.totalCents;
    const planEnabled =
      !!body.paymentPlanEnabled &&
      body.installmentCount != null &&
      body.installmentCount > 0;
    const depositCents = planEnabled ? body.depositCents ?? 0 : 0;
    if (planEnabled && depositCents >= totalCents) {
      throw new BadRequestException(
        "The deposit must be less than the invoice total."
      );
    }
    // A picked fee schedule must be this org's. The late fee is the one
    // the admin entered, else the schedule's; the overdue sweep adds it
    // once a day after the due date (0060).
    let scheduleLateFeeCents = 0;
    if (body.feeScheduleId) {
      const [schedule] = await this.db
        .select({ orgId: schema.feeSchedules.orgId, lateFeeCents: schema.feeSchedules.lateFeeCents })
        .from(schema.feeSchedules)
        .where(eq(schema.feeSchedules.id, body.feeScheduleId))
        .limit(1);
      if (!schedule || schedule.orgId !== body.orgId) {
        throw new NotFoundException("Fee schedule not found in this org");
      }
      scheduleLateFeeCents = schedule.lateFeeCents;
    }
    const lateFeeCents = body.lateFeeCents ?? scheduleLateFeeCents;
    const isBulk = personIds.length > 1;
    const bulkJobId = isBulk ? randomUUID() : null;
    const currency = "USD";

    const created = await this.db.transaction(async (tx) => {
      // One number per invoice, held under the org's lock until commit.
      const numbers = await reserveInvoiceNumbers(tx, body.orgId, personIds.length);
      let nextNumber = 0;
      const rows: (typeof schema.invoices.$inferSelect)[] = [];

      for (const personId of personIds) {
        const [person] = await tx
          .select({ email: schema.profiles.email })
          .from(schema.persons)
          .leftJoin(
            schema.profiles,
            eq(schema.profiles.id, schema.persons.userId)
          )
          .where(eq(schema.persons.id, personId))
          .limit(1);

        const invoiceNumber = numbers[nextNumber++]!;

        const [inv] = await tx
          .insert(schema.invoices)
          .values({
            orgId: body.orgId,
            invoiceNumber,
            invoiceType: teamInvoice ? "team_dues" : body.invoiceType ?? "standard",
            billingScope: body.billingScope,
            recipientPersonId: personId,
            recipientEmail: person?.email ?? null,
            teamId: body.billingScope === "team" ? body.targetId : null,
            divisionId: body.billingScope === "division" ? body.targetId : null,
            leagueId: body.billingScope === "league" ? body.targetId : null,
            seasonId: body.billingScope === "season" ? body.targetId : null,
            bulkJobId,
            subtotalCents,
            discountCents,
            totalCents,
            paidCents: 0,
            currency,
            // Sent invoices are what the player sees and the overdue
            // sweep chases; drafts stay admin-only.
            status: body.asDraft ? "draft" : "sent",
            dueAt: new Date(body.dueAt),
            notes: body.notes ?? null,
            idempotencyKey: isBulk
              ? `${idempotencyKey}-${personId}`
              : idempotencyKey,
            feeScheduleId: body.feeScheduleId ?? null,
            lateFeeCents,
            issuedAt: new Date()
          })
          .returning();
        if (!inv) continue;

        for (const item of body.items) {
          const qty = item.quantity ?? 1;
          await tx.insert(schema.invoiceItems).values({
            invoiceId: inv.id,
            kind: item.kind,
            description: item.description,
            quantity: qty,
            // Discount lines are stored negative, so the lines add up to the total.
            unitAmountCents: signedLineAmount(item.kind, item.unitAmountCents),
            amountCents: signedLineAmount(item.kind, item.unitAmountCents * qty),
            feeScheduleId: body.feeScheduleId ?? null
          });
        }

        if (planEnabled && body.installmentCount) {
          const remainingCents = totalCents - depositCents;
          const baseInstallment = Math.floor(
            remainingCents / body.installmentCount
          );
          const remainder = remainingCents % body.installmentCount;
          const startDate = body.installmentStartDate
            ? new Date(body.installmentStartDate)
            : new Date();

          // Installment 0 is the deposit, due now; skipped for no-deposit plans.
          if (depositCents > 0) {
            await tx.insert(schema.installmentSchedules).values({
              invoiceId: inv.id,
              installmentNumber: 0,
              amountCents: depositCents,
              dueDate: new Date(),
              status: "scheduled"
            });
          }
          for (let i = 1; i <= body.installmentCount; i++) {
            const amount =
              i === body.installmentCount
                ? baseInstallment + remainder
                : baseInstallment;
            const dueDate = new Date(startDate);
            dueDate.setDate(dueDate.getDate() + (i - 1) * 30);
            await tx.insert(schema.installmentSchedules).values({
              invoiceId: inv.id,
              installmentNumber: i,
              amountCents: amount,
              dueDate,
              status: "scheduled"
            });
          }
        }

        rows.push(inv);
      }
      return rows;
    });

    // The payer hears about a sent invoice (drafts stay admin-only).
    if (!body.asDraft) await this.notices.issued(created.map((i) => i.id));
    return {
      invoices: created,
      bulkJobId,
      count: created.length
    };
  }

  /** The captain's person for a team of this org; refuses a team with no captain. */
  private async teamCaptainPersonId(teamId: string, orgId: string): Promise<string> {
    const [team] = await this.db
      .select({ name: schema.teams.name, orgId: schema.teams.orgId, captainUserId: schema.teams.captainUserId })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team || team.orgId !== orgId) throw new NotFoundException("Team not found in this org");
    if (!team.captainUserId) {
      throw new BadRequestException(
        `${team.name} has no captain yet. Assign one on the team page so they can split the invoice, or bill each player with the Division scope.`
      );
    }
    const [captain] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, team.captainUserId))
      .limit(1);
    if (!captain) {
      throw new BadRequestException(
        `${team.name}'s captain has no player profile yet, so they cannot receive the team invoice.`
      );
    }
    return captain.id;
  }

  /**
   * Resolve a `(billingScope, targetId)` pair to the set of person IDs
   * that should be billed. Used by the bulk-create path; also exposed
   * so callers can preview the fan-out size before committing.
   */
  async resolveScopeTargets(
    scope: string,
    targetId: string,
    orgId: string
  ): Promise<string[]> {
    if (scope === "individual") {
      const [p] = await this.db
        .select({ id: schema.persons.id })
        .from(schema.persons)
        .where(eq(schema.persons.id, targetId))
        .limit(1);
      // MON-20: the person must belong to the billing org (404, never
      // reveal that a person exists elsewhere).
      if (!p || !(await personInOrg(this.db, orgId, p.id))) {
        throw new NotFoundException("Person not found in this org");
      }
      return [p.id];
    }
    if (ORG_TARGET_TYPES.includes(scope as OrgTargetType)) {
      // Same "who is in this target" rule as the league announcement
      // (shared/audience/org-targets.ts): active members of teams with an
      // applied or confirmed entry under the target; org = every org team.
      const teamIds = await teamIdsInTarget(
        this.db,
        scope as OrgTargetType,
        targetId,
        orgId
      );
      return activeMemberPersonIds(this.db, teamIds);
    }
    throw new BadRequestException(`Unknown billingScope: ${scope}`);
  }
}
