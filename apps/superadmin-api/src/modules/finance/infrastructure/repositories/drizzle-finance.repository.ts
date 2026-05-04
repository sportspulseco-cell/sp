import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { Page } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type {
  CreateInvoiceInput,
  FeeScheduleRow,
  FinanceRepository,
  InvoiceItemRow,
  InvoiceRow,
  InvoiceStatus,
  ListFeeSchedulesQuery,
  ListInvoicesQuery,
  PaymentMethod,
  PaymentRow,
  PaymentStatus,
  RecordPaymentInput,
  UpsertFeeScheduleInput
} from "../../domain/repositories/finance.repository";

@Injectable()
export class DrizzleFinanceRepository implements FinanceRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------- Fee schedules ----------

  async listFeeSchedules(
    q: ListFeeSchedulesQuery
  ): Promise<Page<FeeScheduleRow>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.feeSchedules.orgId, q.orgId));
    if (q.kind) cs.push(eq(schema.feeSchedules.kind, q.kind));
    if (q.isActive !== undefined)
      cs.push(eq(schema.feeSchedules.isActive, q.isActive));
    if (q.cursor) cs.push(gt(schema.feeSchedules.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.feeSchedules)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(asc(schema.feeSchedules.id))
      .limit(q.limit + 1);
    const hasMore = rows.length > q.limit;
    const items = (hasMore ? rows.slice(0, q.limit) : rows).map((r) =>
      this.toFeeSchedule(r)
    );
    return { items, nextCursor: hasMore ? rows[q.limit - 1]!.id : null };
  }

  async findFeeSchedule(id: string): Promise<FeeScheduleRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.feeSchedules)
      .where(eq(schema.feeSchedules.id, id));
    return row ? this.toFeeSchedule(row) : null;
  }

  async upsertFeeSchedule(
    input: UpsertFeeScheduleInput & { id?: string }
  ): Promise<FeeScheduleRow> {
    if (input.id) {
      const [row] = await this.db
        .update(schema.feeSchedules)
        .set({
          name: input.name,
          description: input.description ?? null,
          kind: input.kind ?? "registration",
          code: input.code ?? null,
          currency: input.currency ?? "USD",
          baseAmountCents: input.baseAmountCents,
          dueOffsetDays: input.dueOffsetDays ?? 14,
          lateFeeCents: input.lateFeeCents ?? 0,
          seasonId: input.seasonId ?? null,
          leagueId: input.leagueId ?? null,
          divisionId: input.divisionId ?? null,
          isActive: input.isActive ?? true,
          metadata: input.metadata ?? {},
          updatedAt: sql`NOW()`
        })
        .where(eq(schema.feeSchedules.id, input.id))
        .returning();
      if (!row) throw new Error("fee_schedule not found");
      return this.toFeeSchedule(row);
    }

    const [row] = await this.db
      .insert(schema.feeSchedules)
      .values({
        orgId: input.orgId,
        name: input.name,
        description: input.description ?? null,
        kind: input.kind ?? "registration",
        code: input.code ?? null,
        currency: input.currency ?? "USD",
        baseAmountCents: input.baseAmountCents,
        dueOffsetDays: input.dueOffsetDays ?? 14,
        lateFeeCents: input.lateFeeCents ?? 0,
        seasonId: input.seasonId ?? null,
        leagueId: input.leagueId ?? null,
        divisionId: input.divisionId ?? null,
        isActive: input.isActive ?? true,
        metadata: input.metadata ?? {}
      })
      .returning();
    return this.toFeeSchedule(row!);
  }

  // ---------- Invoices ----------

  async listInvoices(q: ListInvoicesQuery): Promise<Page<InvoiceRow>> {
    const cs = [];
    if (q.orgId) cs.push(eq(schema.invoices.orgId, q.orgId));
    if (q.status) cs.push(eq(schema.invoices.status, q.status));
    if (q.recipientPersonId)
      cs.push(eq(schema.invoices.recipientPersonId, q.recipientPersonId));
    if (q.registrationId)
      cs.push(eq(schema.invoices.registrationId, q.registrationId));
    if (q.cursor) cs.push(gt(schema.invoices.id, q.cursor));

    const rows = await this.db
      .select()
      .from(schema.invoices)
      .where(cs.length ? and(...cs) : undefined)
      .orderBy(desc(schema.invoices.createdAt))
      .limit(q.limit + 1);
    const hasMore = rows.length > q.limit;
    const slice = hasMore ? rows.slice(0, q.limit) : rows;

    // Fetch all items for these invoices in one query.
    const ids = slice.map((r) => r.id);
    const items = ids.length
      ? await this.db
          .select()
          .from(schema.invoiceItems)
          .where(eq(schema.invoiceItems.invoiceId, ids[0]!)) // narrow seed; replaced via inArray below
      : [];
    // Switch to inArray for >1
    if (ids.length > 1) {
      items.length = 0;
      const all = await this.db
        .select()
        .from(schema.invoiceItems)
        .where(sql`${schema.invoiceItems.invoiceId} = ANY(${ids})`);
      items.push(...all);
    }
    const itemsByInvoice = new Map<string, InvoiceItemRow[]>();
    for (const it of items) {
      const list = itemsByInvoice.get(it.invoiceId) ?? [];
      list.push(this.toInvoiceItem(it));
      itemsByInvoice.set(it.invoiceId, list);
    }

    const out = slice.map((r) =>
      this.toInvoice(r, itemsByInvoice.get(r.id) ?? [])
    );
    return { items: out, nextCursor: hasMore ? slice[slice.length - 1]!.id : null };
  }

  async findInvoice(id: string): Promise<InvoiceRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id));
    if (!row) return null;
    const items = await this.db
      .select()
      .from(schema.invoiceItems)
      .where(eq(schema.invoiceItems.invoiceId, id));
    return this.toInvoice(row, items.map((i) => this.toInvoiceItem(i)));
  }

  async findInvoiceByIdempotencyKey(key: string): Promise<InvoiceRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.idempotencyKey, key));
    if (!row) return null;
    return this.findInvoice(row.id);
  }

  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceRow> {
    const subtotal = input.items.reduce(
      (acc, i) => acc + i.unitAmountCents * (i.quantity ?? 1),
      0
    );
    const tax = input.taxCents ?? 0;
    const discount = input.discountCents ?? 0;
    const total = Math.max(0, subtotal + tax - discount);

    const invoiceNumber =
      input.invoiceNumber ?? (await this.nextInvoiceNumber(input.orgId));

    return await this.db.transaction(async (tx) => {
      const [inv] = await tx
        .insert(schema.invoices)
        .values({
          orgId: input.orgId,
          invoiceNumber,
          registrationId: input.registrationId ?? null,
          recipientPersonId: input.recipientPersonId ?? null,
          recipientEmail: input.recipientEmail ?? null,
          currency: input.currency ?? "USD",
          subtotalCents: subtotal,
          taxCents: tax,
          discountCents: discount,
          totalCents: total,
          paidCents: 0,
          status: "draft",
          dueAt: input.dueAt ?? null,
          notes: input.notes ?? null,
          idempotencyKey: input.idempotencyKey ?? null
        })
        .returning();
      if (!inv) throw new Error("invoice insert failed");

      const itemRows = input.items.map((i) => ({
        invoiceId: inv.id,
        kind: i.kind ?? "registration_fee",
        description: i.description,
        quantity: i.quantity ?? 1,
        unitAmountCents: i.unitAmountCents,
        amountCents: i.unitAmountCents * (i.quantity ?? 1),
        feeScheduleId: i.feeScheduleId ?? null,
        metadata: i.metadata ?? {}
      }));
      const items = itemRows.length
        ? await tx.insert(schema.invoiceItems).values(itemRows).returning()
        : [];
      return this.toInvoice(inv, items.map((i) => this.toInvoiceItem(i)));
    });
  }

  async markSent(id: string): Promise<InvoiceRow> {
    await this.db
      .update(schema.invoices)
      .set({
        status: "sent",
        issuedAt: sql`COALESCE(${schema.invoices.issuedAt}, NOW())`,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.invoices.id, id));
    const found = await this.findInvoice(id);
    if (!found) throw new Error("invoice not found");
    return found;
  }

  async voidInvoice(id: string, reason?: string): Promise<InvoiceRow> {
    await this.db
      .update(schema.invoices)
      .set({
        status: "void",
        notes: reason
          ? sql`COALESCE(${schema.invoices.notes} || E'\n', '') || ${reason}`
          : schema.invoices.notes,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.invoices.id, id));
    const found = await this.findInvoice(id);
    if (!found) throw new Error("invoice not found");
    return found;
  }

  async reconcileStatus(id: string): Promise<InvoiceRow> {
    const inv = await this.findInvoice(id);
    if (!inv) throw new Error("invoice not found");

    const pays = await this.listPayments(id);
    const succeeded = pays
      .filter((p) => p.status === "succeeded")
      .reduce((acc, p) => acc + p.amountCents, 0);

    let status: InvoiceStatus = inv.status;
    if (status === "void") status = "void";
    else if (succeeded >= inv.totalCents && inv.totalCents > 0) status = "paid";
    else if (succeeded > 0) status = "partial";
    else if (inv.dueAt && inv.dueAt < new Date()) status = "overdue";
    else if (inv.issuedAt) status = "sent";
    else status = inv.status;

    await this.db
      .update(schema.invoices)
      .set({
        paidCents: succeeded,
        paidAt: status === "paid" ? sql`NOW()` : null,
        status,
        updatedAt: sql`NOW()`
      })
      .where(eq(schema.invoices.id, id));

    const found = await this.findInvoice(id);
    if (!found) throw new Error("invoice not found");
    return found;
  }

  // ---------- Payments ----------

  async recordPayment(input: RecordPaymentInput): Promise<PaymentRow> {
    const [row] = await this.db
      .insert(schema.payments)
      .values({
        orgId: input.orgId,
        invoiceId: input.invoiceId,
        amountCents: input.amountCents,
        currency: input.currency ?? "USD",
        method: input.method ?? "manual",
        status: input.status ?? "succeeded",
        receivedAt: input.receivedAt ?? new Date(),
        externalProviderId: input.externalProviderId ?? null,
        recordedByUserId: input.recordedByUserId ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? {}
      })
      .returning();
    await this.reconcileStatus(input.invoiceId);
    return this.toPayment(row!);
  }

  async listPayments(invoiceId: string): Promise<PaymentRow[]> {
    const rows = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.invoiceId, invoiceId))
      .orderBy(desc(schema.payments.receivedAt));
    return rows.map((r) => this.toPayment(r));
  }

  async nextInvoiceNumber(orgId: string): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `INV-${year}-`;
    const rows = await this.db.execute<{ max: string | null }>(
      sql`SELECT MAX(invoice_number) as max FROM invoices
          WHERE org_id = ${orgId} AND invoice_number LIKE ${prefix + "%"}`
    );
    const max = rows[0]?.max ?? null;
    let next = 1;
    if (max) {
      const tail = max.replace(prefix, "");
      const n = parseInt(tail, 10);
      if (!isNaN(n)) next = n + 1;
    }
    return `${prefix}${String(next).padStart(4, "0")}`;
  }

  // ---------- Mappers ----------

  private toFeeSchedule(
    r: typeof schema.feeSchedules.$inferSelect
  ): FeeScheduleRow {
    return {
      id: r.id,
      orgId: r.orgId,
      name: r.name,
      description: r.description,
      kind: r.kind,
      code: r.code,
      currency: r.currency,
      baseAmountCents: r.baseAmountCents,
      dueOffsetDays: r.dueOffsetDays,
      lateFeeCents: r.lateFeeCents,
      seasonId: r.seasonId,
      leagueId: r.leagueId,
      divisionId: r.divisionId,
      isActive: r.isActive,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }

  private toInvoice(
    r: typeof schema.invoices.$inferSelect,
    items: InvoiceItemRow[]
  ): InvoiceRow {
    return {
      id: r.id,
      orgId: r.orgId,
      invoiceNumber: r.invoiceNumber,
      registrationId: r.registrationId,
      recipientPersonId: r.recipientPersonId,
      recipientEmail: r.recipientEmail,
      currency: r.currency,
      subtotalCents: r.subtotalCents,
      taxCents: r.taxCents,
      discountCents: r.discountCents,
      totalCents: r.totalCents,
      paidCents: r.paidCents,
      status: r.status as InvoiceStatus,
      issuedAt: r.issuedAt,
      dueAt: r.dueAt,
      paidAt: r.paidAt,
      notes: r.notes,
      idempotencyKey: r.idempotencyKey,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      items
    };
  }

  private toInvoiceItem(
    r: typeof schema.invoiceItems.$inferSelect
  ): InvoiceItemRow {
    return {
      id: r.id,
      invoiceId: r.invoiceId,
      kind: r.kind,
      description: r.description,
      quantity: r.quantity,
      unitAmountCents: r.unitAmountCents,
      amountCents: r.amountCents,
      feeScheduleId: r.feeScheduleId,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt
    };
  }

  private toPayment(r: typeof schema.payments.$inferSelect): PaymentRow {
    return {
      id: r.id,
      orgId: r.orgId,
      invoiceId: r.invoiceId,
      amountCents: r.amountCents,
      currency: r.currency,
      method: r.method as PaymentMethod,
      status: r.status as PaymentStatus,
      receivedAt: r.receivedAt,
      externalProviderId: r.externalProviderId,
      recordedByUserId: r.recordedByUserId,
      notes: r.notes,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt
    };
  }
}
