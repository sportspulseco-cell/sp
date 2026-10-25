import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import {
  formatMoney,
  readStoreProductOptions,
  STORE_GENERATE_ITEMS,
  STORE_KIND_LABELS,
  STORE_ORDER_STATUS_LABELS,
  STORE_ORDER_TRANSITIONS,
  storeLineLabel,
  validateStoreOrderLine,
  type StoreOrderStatus,
  type StoreProductKind
} from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { playerWebUrl } from "../../../shared/app-urls";
import { notifyAudience } from "../../../shared/audience/notify-audience";
import { NotificationService } from "../../communications/application/notification.service";
import { reserveInvoiceNumbers } from "../../finance/application/services/invoice-number";

export interface OrderLineInput {
  productId: string;
  quantity: number;
  size?: string | null;
  personalName?: string | null;
  personalNumber?: number | null;
}

const MAX_LINES = 10;

/**
 * Team store orders (UC-25, UC-26, MON-15). An order is the lines a
 * player picked plus one invoice for the total; the invoice is paid on
 * the player's Payments page like any other, so money has one home.
 * The order row carries fulfilment: placed -> processing -> shipped, or
 * cancelled while unpaid.
 */
@Injectable()
export class StoreOrdersService {
  private readonly log = new Logger(StoreOrdersService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService,
    private readonly config: ConfigService
  ) {}

  // ------------------------------------------------------------- player

  /** The caller's person and roster entry on this team, or 403. */
  async memberOf(userId: string, teamId: string) {
    const [person] = await this.db
      .select({
        id: schema.persons.id,
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        preferred: schema.persons.preferredName
      })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    if (!person) throw new ForbiddenException("No player profile on this account.");
    const [membership] = await this.db
      .select({ jerseyNumber: schema.teamMemberships.jerseyNumber })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, teamId),
          eq(schema.teamMemberships.personId, person.id),
          eq(schema.teamMemberships.currentStatus, "active")
        )
      )
      .orderBy(desc(schema.teamMemberships.createdAt))
      .limit(1);
    if (!membership) throw new ForbiddenException("Only players on this team's roster can order from its store.");
    const n = Number(membership.jerseyNumber);
    return {
      personId: person.id,
      name: person.preferred ?? `${person.first} ${person.last}`.trim(),
      // Roster data for the back of the shirt (UC-25): surname and number.
      backName: person.last ?? null,
      jerseyNumber: Number.isInteger(n) && n >= 0 && n <= 99 && membership.jerseyNumber !== null ? n : null
    };
  }

  async placeOrder(userId: string, teamId: string, lines: OrderLineInput[], requestKey: string | null) {
    const me = await this.memberOf(userId, teamId);
    if (!Array.isArray(lines) || lines.length === 0) throw new UnprocessableEntityException("Add at least one item.");
    if (lines.length > MAX_LINES) throw new UnprocessableEntityException(`An order can have at most ${MAX_LINES} items.`);

    // A repeated submit of the same checkout returns the first order.
    const idem = requestKey ? `store-order:${me.personId}:${requestKey}` : null;
    if (idem) {
      const prior = await this.orderByInvoiceKey(idem);
      if (prior) return { order: prior, replay: true };
    }

    const [team] = await this.db
      .select({ id: schema.teams.id, orgId: schema.teams.orgId, name: schema.teams.name })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");

    const [contact] = await this.db
      .select({ email: schema.profiles.email })
      .from(schema.persons)
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(eq(schema.persons.id, me.personId))
      .limit(1);

    const orderId = await this.db.transaction(async (tx) => {
      // Lock the products so two buyers cannot take the same last item.
      const ids = [...new Set(lines.map((l) => l.productId))];
      await tx.execute(sql`SELECT id FROM team_store_products WHERE id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) FOR UPDATE`);
      const products = await tx
        .select()
        .from(schema.teamStoreProducts)
        .where(inArray(schema.teamStoreProducts.id, ids));
      const byId = new Map(products.map((p) => [p.id, p]));
      const stock = new Map(products.map((p) => [p.id, p.stockQty]));

      const rows: Array<typeof schema.teamStoreOrderItems.$inferInsert> = [];
      let total = 0;
      let currency: string | null = null;
      for (const [i, l] of lines.entries()) {
        const p = byId.get(l.productId);
        if (!p || p.teamId !== teamId || !p.isActive) {
          throw new UnprocessableEntityException(`Item ${i + 1} is not in this store any more.`);
        }
        const problem = validateStoreOrderLine(readStoreProductOptions(p.metadata), l);
        if (problem) throw new UnprocessableEntityException(`${p.name}: ${problem}`);
        if (currency && currency !== p.currency) throw new UnprocessableEntityException("All items in one order must be in one currency.");
        currency = p.currency;
        const onHand = stock.get(p.id);
        // Unlimited stock (null) never backorders; otherwise take what is
        // there and flag the rest (UC-26 "backorder flagged").
        const take = onHand == null ? 0 : Math.min(onHand, l.quantity);
        if (onHand != null) stock.set(p.id, onHand - take);
        rows.push({
          orderId: "",
          productId: p.id,
          productName: p.name,
          unitPriceCents: p.priceCents,
          quantity: l.quantity,
          size: l.size?.trim() || null,
          personalName: l.personalName?.trim() || null,
          personalNumber: l.personalNumber ?? null,
          backorder: onHand != null && take < l.quantity,
          reservedQty: take
        });
        total += p.priceCents * l.quantity;
      }
      for (const [pid, qty] of stock) {
        if (qty !== byId.get(pid)!.stockQty) {
          await tx
            .update(schema.teamStoreProducts)
            .set({ stockQty: qty, updatedAt: new Date() })
            .where(eq(schema.teamStoreProducts.id, pid));
        }
      }

      const [number] = await reserveInvoiceNumbers(tx, team.orgId);
      const [inv] = await tx
        .insert(schema.invoices)
        .values({
          orgId: team.orgId,
          invoiceNumber: number!,
          recipientPersonId: me.personId,
          recipientEmail: contact?.email ?? null,
          currency: currency ?? "USD",
          subtotalCents: total,
          totalCents: total,
          paidCents: 0,
          status: "sent",
          issuedAt: new Date(),
          teamId,
          notes: `${team.name} team store order`,
          idempotencyKey: idem,
          metadata: { kind: "store_order" }
        })
        .returning({ id: schema.invoices.id });
      const [order] = await tx
        .insert(schema.teamStoreOrders)
        .values({
          orgId: team.orgId,
          teamId,
          buyerPersonId: me.personId,
          invoiceId: inv!.id,
          totalCents: total,
          currency: currency ?? "USD"
        })
        .returning({ id: schema.teamStoreOrders.id });
      await tx.insert(schema.teamStoreOrderItems).values(rows.map((r) => ({ ...r, orderId: order!.id })));
      await tx.insert(schema.invoiceItems).values(
        rows.map((r) => ({
          invoiceId: inv!.id,
          kind: "store_item",
          description: storeLineLabel(r.productName, { ...r, quantity: 1 }),
          quantity: r.quantity,
          unitAmountCents: r.unitPriceCents,
          amountCents: r.unitPriceCents * r.quantity,
          metadata: { orderId: order!.id, productId: r.productId }
        }))
      );
      await tx
        .update(schema.invoices)
        .set({ metadata: sql`${schema.invoices.metadata} || ${JSON.stringify({ orderId: order!.id })}::jsonb` })
        .where(eq(schema.invoices.id, inv!.id));
      return order!.id;
    });

    const order = await this.loadOrder(orderId);
    if (!order) throw new Error(`order ${orderId}: readback failed`);
    this.log.log(`order placed id=${orderId} team=${teamId} buyer=${me.personId} lines=${order.items.length} total=${order.totalCents} backorder=${order.items.some((i) => i.backorder)}`);
    await this.notify.queue({
      orgId: team.orgId,
      templateCode: "store.order.placed",
      idempotencyKey: `store.order.placed:${orderId}`,
      recipientPersonId: me.personId,
      payload: {
        orderId,
        personName: me.name,
        teamName: team.name,
        lines: order.items.map((i) => `- ${i.label}${i.backorder ? " (backorder)" : ""}`).join("\n"),
        totalLabel: formatMoney(order.totalCents, order.currency),
        invoiceNumber: order.invoice?.number ?? "",
        payUrl: `${playerWebUrl(this.config)}/payments`
      }
    });
    return { order, replay: false };
  }

  async myOrders(userId: string, teamId: string) {
    const me = await this.memberOf(userId, teamId);
    const ids = await this.db
      .select({ id: schema.teamStoreOrders.id })
      .from(schema.teamStoreOrders)
      .where(and(eq(schema.teamStoreOrders.teamId, teamId), eq(schema.teamStoreOrders.buyerPersonId, me.personId)))
      .orderBy(desc(schema.teamStoreOrders.createdAt))
      .limit(50);
    return this.loadOrders(ids.map((r) => r.id));
  }

  async cancelByBuyer(userId: string, orderId: string) {
    const order = await this.loadOrder(orderId);
    const [person] = await this.db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(eq(schema.persons.userId, userId))
      .limit(1);
    // Someone else's order does not exist for this caller.
    if (!order || !person || order.buyer.personId !== person.id) throw new NotFoundException("Order not found");
    return this.transition(order.id, "cancelled", null, userId);
  }

  // ------------------------------------------------------------ captain

  async teamOrders(teamId: string) {
    const ids = await this.db
      .select({ id: schema.teamStoreOrders.id })
      .from(schema.teamStoreOrders)
      .where(eq(schema.teamStoreOrders.teamId, teamId))
      .orderBy(desc(schema.teamStoreOrders.createdAt))
      .limit(200);
    return this.loadOrders(ids.map((r) => r.id));
  }

  async teamIdOfOrder(orderId: string): Promise<string | null> {
    const [o] = await this.db
      .select({ teamId: schema.teamStoreOrders.teamId })
      .from(schema.teamStoreOrders)
      .where(eq(schema.teamStoreOrders.id, orderId))
      .limit(1);
    return o?.teamId ?? null;
  }

  /**
   * Move an order on. Processing and shipped need the invoice paid;
   * cancelling needs it unpaid (a paid order is a refund, which the
   * league handles). Cancelling voids the invoice and returns the stock.
   */
  async transition(orderId: string, to: StoreOrderStatus, note: string | null, byUserId: string) {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM team_store_orders WHERE id = ${orderId} FOR UPDATE`);
      const [o] = await tx.select().from(schema.teamStoreOrders).where(eq(schema.teamStoreOrders.id, orderId)).limit(1);
      if (!o) throw new NotFoundException("Order not found");
      const from = o.status as StoreOrderStatus;
      if (!STORE_ORDER_TRANSITIONS[from]?.includes(to)) {
        throw new ConflictException(
          `This order is ${(STORE_ORDER_STATUS_LABELS[from] ?? from).toLowerCase()}, so it cannot be marked ${STORE_ORDER_STATUS_LABELS[to].toLowerCase()}.`
        );
      }
      const [inv] = o.invoiceId
        ? await tx.select().from(schema.invoices).where(eq(schema.invoices.id, o.invoiceId)).limit(1)
        : [];
      const paid = !!inv && inv.status === "paid";
      if ((to === "processing" || to === "shipped") && !paid) {
        throw new ConflictException("This order is not paid yet. It can be processed once the invoice is paid.");
      }
      if (to === "cancelled") {
        if (inv && inv.paidCents > 0) {
          throw new ConflictException("Part or all of this order is paid. Ask the league to refund it.");
        }
        if (inv && inv.status !== "void") {
          await tx.update(schema.invoices).set({ status: "void", updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id));
        }
        const items = await tx.select().from(schema.teamStoreOrderItems).where(eq(schema.teamStoreOrderItems.orderId, o.id));
        for (const it of items) {
          if (it.productId && it.reservedQty > 0) {
            await tx
              .update(schema.teamStoreProducts)
              .set({
                stockQty: sql`CASE WHEN ${schema.teamStoreProducts.stockQty} IS NULL THEN NULL ELSE ${schema.teamStoreProducts.stockQty} + ${it.reservedQty} END`,
                updatedAt: new Date()
              })
              .where(eq(schema.teamStoreProducts.id, it.productId));
          }
        }
      }
      const changed = await tx
        .update(schema.teamStoreOrders)
        .set({ status: to, note: note?.trim() || o.note, statusChangedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.teamStoreOrders.id, o.id), eq(schema.teamStoreOrders.status, from)))
        .returning({ id: schema.teamStoreOrders.id });
      if (changed.length !== 1) throw new ConflictException("This order changed while you were saving. Reload and try again.");
    });
    const order = await this.loadOrder(orderId);
    if (!order || order.status !== to) throw new Error(`order ${orderId}: readback does not show ${to}`);
    this.log.log(`order ${orderId} -> ${to} by=${byUserId}`);
    await this.notify.queue({
      orgId: order.orgId,
      templateCode: "store.order.status",
      idempotencyKey: `store.order.status:${orderId}:${to}`,
      recipientPersonId: order.buyer.personId,
      payload: {
        orderId,
        teamName: order.teamName,
        statusLabel: STORE_ORDER_STATUS_LABELS[to].toLowerCase(),
        lines: order.items.map((i) => `- ${i.label}`).join("\n"),
        noteLine: order.note ? `Note from your captain: ${order.note}` : ""
      }
    });
    return order;
  }

  /**
   * UC-25 "Generate team store": the standard items with name and number
   * personalization, at the captain's prices. An item already generated
   * for the team is skipped. Players on the roster are told.
   */
  async generate(userId: string, teamId: string, items: Array<{ kind: StoreProductKind; priceCents: number }>, tellPlayers: boolean) {
    const [team] = await this.db
      .select({ id: schema.teams.id, orgId: schema.teams.orgId, name: schema.teams.name })
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);
    if (!team) throw new NotFoundException("Team not found");
    if (!Array.isArray(items) || items.length === 0) throw new UnprocessableEntityException("Pick at least one item.");
    for (const it of items) {
      if (!STORE_GENERATE_ITEMS.some((g) => g.kind === it.kind)) throw new UnprocessableEntityException("Pick from jersey, hoodie and cap.");
      if (!Number.isInteger(it.priceCents) || it.priceCents < 1) {
        throw new UnprocessableEntityException(`Set a price for the ${STORE_KIND_LABELS[it.kind].toLowerCase()}.`);
      }
    }
    const existing = await this.db
      .select({ metadata: schema.teamStoreProducts.metadata })
      .from(schema.teamStoreProducts)
      .where(eq(schema.teamStoreProducts.teamId, teamId));
    const have = new Set(
      existing
        .map((p) => p.metadata as Record<string, unknown>)
        .filter((m) => m?.generated === true)
        .map((m) => String(m.kind))
    );
    const created: string[] = [];
    const skipped: string[] = [];
    for (const it of items) {
      const opts = STORE_GENERATE_ITEMS.find((g) => g.kind === it.kind)!;
      const label = STORE_KIND_LABELS[it.kind];
      if (have.has(it.kind)) {
        skipped.push(label);
        continue;
      }
      await this.db.insert(schema.teamStoreProducts).values({
        teamId,
        name: `${team.name} ${label.toLowerCase()}`,
        description:
          opts.personalization.name || opts.personalization.number
            ? `With your ${[opts.personalization.name ? "name" : null, opts.personalization.number ? "number" : null].filter(Boolean).join(" and ")} on the back.`
            : null,
        priceCents: it.priceCents,
        currency: "USD",
        variantLabel: opts.sizes.length ? `Sizes ${opts.sizes[0]} to ${opts.sizes[opts.sizes.length - 1]}` : "One size",
        stockQty: null,
        isActive: true,
        metadata: { kind: it.kind, sizes: opts.sizes, personalization: opts.personalization, generated: true },
        createdByUserId: userId
      });
      created.push(label);
    }
    let told = 0;
    if (tellPlayers && created.length > 0) {
      const r = await notifyAudience(this.db, this.notify, {
        orgId: team.orgId,
        target: { teamIds: [teamId] },
        audiences: ["players"],
        templateCode: "team_store.open",
        key: `team_store.open:${teamId}:${created.join("+").toLowerCase()}`,
        payload: {
          teamName: team.name,
          items: created.join(", ").toLowerCase(),
          storeUrl: `${playerWebUrl(this.config)}/store`
        }
      });
      told = r.queued;
    }
    this.log.log(`store generated team=${teamId} created=${created.join(",") || "-"} skipped=${skipped.join(",") || "-"} told=${told}`);
    return { created, skipped, playersTold: told };
  }

  // -------------------------------------------------------------- reads

  private async orderByInvoiceKey(key: string) {
    const [row] = await this.db
      .select({ id: schema.teamStoreOrders.id })
      .from(schema.teamStoreOrders)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.teamStoreOrders.invoiceId))
      .where(eq(schema.invoices.idempotencyKey, key))
      .limit(1);
    return row ? this.loadOrder(row.id) : null;
  }

  async loadOrder(id: string) {
    const [o] = await this.loadOrders([id]);
    return o ?? null;
  }

  async loadOrders(ids: string[]) {
    if (ids.length === 0) return [];
    const orders = await this.db
      .select({
        o: schema.teamStoreOrders,
        teamName: schema.teams.name,
        first: schema.persons.legalFirstName,
        last: schema.persons.legalLastName,
        preferred: schema.persons.preferredName,
        invNumber: schema.invoices.invoiceNumber,
        invStatus: schema.invoices.status,
        invPaid: schema.invoices.paidCents,
        invTotal: schema.invoices.totalCents
      })
      .from(schema.teamStoreOrders)
      .innerJoin(schema.teams, eq(schema.teams.id, schema.teamStoreOrders.teamId))
      .innerJoin(schema.persons, eq(schema.persons.id, schema.teamStoreOrders.buyerPersonId))
      .leftJoin(schema.invoices, eq(schema.invoices.id, schema.teamStoreOrders.invoiceId))
      .where(inArray(schema.teamStoreOrders.id, ids));
    const items = await this.db
      .select()
      .from(schema.teamStoreOrderItems)
      .where(inArray(schema.teamStoreOrderItems.orderId, ids));
    const order = new Map(ids.map((id, i) => [id, i]));
    return orders
      .map(({ o, ...r }) => {
        const status = o.status as StoreOrderStatus;
        return {
          id: o.id,
          orgId: o.orgId,
          teamId: o.teamId,
          teamName: r.teamName,
          status,
          statusLabel: STORE_ORDER_STATUS_LABELS[status] ?? o.status,
          totalCents: o.totalCents,
          currency: o.currency,
          note: o.note,
          createdAt: o.createdAt.toISOString(),
          statusChangedAt: o.statusChangedAt?.toISOString() ?? null,
          buyer: { personId: o.buyerPersonId, name: r.preferred ?? `${r.first} ${r.last}`.trim() },
          invoice: o.invoiceId
            ? { id: o.invoiceId, number: r.invNumber ?? "", status: r.invStatus ?? "sent", paidCents: r.invPaid ?? 0, totalCents: r.invTotal ?? o.totalCents }
            : null,
          paid: r.invStatus === "paid",
          items: items
            .filter((i) => i.orderId === o.id)
            .map((i) => ({
              id: i.id,
              productId: i.productId,
              productName: i.productName,
              unitPriceCents: i.unitPriceCents,
              quantity: i.quantity,
              size: i.size,
              personalName: i.personalName,
              personalNumber: i.personalNumber,
              backorder: i.backorder,
              label: storeLineLabel(i.productName, i)
            }))
        };
      })
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
}
