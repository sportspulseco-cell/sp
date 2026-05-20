import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type { BulkCreateInvoiceBodyDto } from "../../interface/dto/bulk-invoice.dto";

/**
 * Bulk invoice creation extracted from FinanceInvoicingController so the
 * sa-only controller and the org-admin proxy can both delegate to a
 * single implementation. Cardinal rule: one source of truth for the
 * fan-out + insert + payment-plan logic — never two.
 */
@Injectable()
export class InvoicingService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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

    const personIds = await this.resolveScopeTargets(
      body.billingScope,
      body.targetId,
      body.orgId
    );
    if (personIds.length === 0) {
      throw new BadRequestException(
        "No active members found for the selected target."
      );
    }

    const subtotalCents = body.items.reduce(
      (a, i) => a + (i.unitAmountCents ?? 0) * (i.quantity ?? 1),
      0
    );
    const totalCents = subtotalCents;
    const isBulk = personIds.length > 1;
    const bulkJobId = isBulk ? randomUUID() : null;
    const currency = "USD";

    const created = await this.db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const [yc] = await tx.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count FROM invoices
        WHERE org_id = ${body.orgId}
          AND EXTRACT(YEAR FROM created_at) = ${year}
      `);
      let nextSeq = (yc?.count ?? 0) + 1;
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

        const invoiceNumber = `INV-${year}-${String(nextSeq++).padStart(
          5,
          "0"
        )}`;

        const [inv] = await tx
          .insert(schema.invoices)
          .values({
            orgId: body.orgId,
            invoiceNumber,
            invoiceType: body.invoiceType ?? "manual",
            billingScope: body.billingScope,
            recipientPersonId: personId,
            recipientEmail: person?.email ?? null,
            teamId: body.billingScope === "team" ? body.targetId : null,
            divisionId: body.billingScope === "division" ? body.targetId : null,
            leagueId: body.billingScope === "league" ? body.targetId : null,
            seasonId: body.billingScope === "season" ? body.targetId : null,
            bulkJobId,
            subtotalCents,
            totalCents,
            paidCents: 0,
            currency,
            status: "draft",
            dueAt: new Date(body.dueAt),
            notes: body.notes ?? null,
            idempotencyKey: isBulk
              ? `${idempotencyKey}-${personId}`
              : idempotencyKey,
            feeScheduleId: body.feeScheduleId ?? null,
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
            unitAmountCents: item.unitAmountCents,
            amountCents: item.unitAmountCents * qty,
            feeScheduleId: body.feeScheduleId ?? null
          });
        }

        if (
          body.paymentPlanEnabled &&
          body.depositCents != null &&
          body.installmentCount != null &&
          body.installmentCount > 0
        ) {
          const remainingCents = totalCents - body.depositCents;
          const baseInstallment = Math.floor(
            remainingCents / body.installmentCount
          );
          const remainder = remainingCents % body.installmentCount;
          const startDate = body.installmentStartDate
            ? new Date(body.installmentStartDate)
            : new Date();

          await tx.insert(schema.installmentSchedules).values({
            invoiceId: inv.id,
            installmentNumber: 0,
            amountCents: body.depositCents,
            dueDate: new Date(),
            status: "scheduled"
          });
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

    return {
      invoices: created,
      bulkJobId,
      count: created.length
    };
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
      if (!p) throw new NotFoundException("Person not found in this org");
      return [p.id];
    }
    if (scope === "team") {
      const rows = await this.db
        .select({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.teamId, targetId),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return [...new Set(rows.map((r) => r.personId))];
    }
    if (scope === "division") {
      const rows = await this.db
        .selectDistinct({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .innerJoin(
          schema.divisionTeamEntries,
          eq(schema.divisionTeamEntries.teamId, schema.teamMemberships.teamId)
        )
        .where(
          and(
            eq(schema.divisionTeamEntries.divisionId, targetId),
            inArray(schema.divisionTeamEntries.entryStatus, [
              "applied",
              "confirmed"
            ]),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return rows.map((r) => r.personId);
    }
    if (scope === "league") {
      const rows = await this.db
        .selectDistinct({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .innerJoin(
          schema.divisionTeamEntries,
          eq(schema.divisionTeamEntries.teamId, schema.teamMemberships.teamId)
        )
        .innerJoin(
          schema.divisions,
          eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
        )
        .innerJoin(
          schema.seasons,
          eq(schema.seasons.id, schema.divisions.seasonId)
        )
        .where(
          and(
            eq(schema.seasons.leagueId, targetId),
            inArray(schema.divisionTeamEntries.entryStatus, [
              "applied",
              "confirmed"
            ]),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return rows.map((r) => r.personId);
    }
    if (scope === "season") {
      const rows = await this.db
        .selectDistinct({ personId: schema.teamMemberships.personId })
        .from(schema.teamMemberships)
        .innerJoin(
          schema.divisionTeamEntries,
          eq(schema.divisionTeamEntries.teamId, schema.teamMemberships.teamId)
        )
        .innerJoin(
          schema.divisions,
          eq(schema.divisions.id, schema.divisionTeamEntries.divisionId)
        )
        .where(
          and(
            eq(schema.divisions.seasonId, targetId),
            inArray(schema.divisionTeamEntries.entryStatus, [
              "applied",
              "confirmed"
            ]),
            eq(schema.teamMemberships.currentStatus, "active")
          )
        );
      return rows.map((r) => r.personId);
    }
    if (scope === "org") {
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
      return rows.map((r) => r.personId);
    }
    throw new BadRequestException(`Unknown billingScope: ${scope}`);
  }
}
