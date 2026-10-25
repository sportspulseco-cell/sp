import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { playerWebUrl } from "../../../../shared/app-urls";
import { NotificationService } from "../../../communications/application/notification.service";

/**
 * Tell the payer an invoice was issued (UC-15). Nobody was told: the
 * "invoice.created" template existed but nothing queued it (J13). Sent
 * when an invoice is created as sent and when a draft is sent later;
 * drafts stay admin-only. Idempotent per invoice, so a second send or a
 * retried create does not notify twice. Email when the payer has an
 * address, in the app otherwise.
 */
@Injectable()
export class InvoiceNoticesService {
  private readonly log = new Logger("InvoiceNotices");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notify: NotificationService,
    private readonly config: ConfigService
  ) {}

  async issued(invoiceIds: string[]): Promise<number> {
    if (invoiceIds.length === 0) return 0;
    const rows = await this.db
      .select({
        id: schema.invoices.id,
        orgId: schema.invoices.orgId,
        number: schema.invoices.invoiceNumber,
        status: schema.invoices.status,
        totalCents: schema.invoices.totalCents,
        currency: schema.invoices.currency,
        dueAt: schema.invoices.dueAt,
        personId: schema.invoices.recipientPersonId,
        invoiceEmail: schema.invoices.recipientEmail,
        accountEmail: schema.profiles.email
      })
      .from(schema.invoices)
      .leftJoin(schema.persons, eq(schema.persons.id, schema.invoices.recipientPersonId))
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(inArray(schema.invoices.id, invoiceIds));

    const url = `${playerWebUrl(this.config)}/payments`;
    let queued = 0;
    for (const inv of rows) {
      if (inv.status === "draft" || inv.status === "void") continue;
      const email = inv.accountEmail ?? inv.invoiceEmail ?? null;
      if (!inv.personId && !email) continue;
      const amountLabel = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: inv.currency || "USD"
      }).format((inv.totalCents ?? 0) / 100);
      const dueLabel = inv.dueAt
        ? new Date(inv.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
        : "on receipt";
      const row = await this.notify.queue({
        orgId: inv.orgId,
        templateCode: "invoice.created",
        channel: email ? "email" : "in_app",
        idempotencyKey: `invoice.created:${inv.id}`,
        recipientPersonId: inv.personId,
        recipientEmail: email,
        payload: {
          invoiceNumber: inv.number,
          amountLabel,
          dueLabel,
          invoiceUrl: url,
          invoiceId: inv.id
        },
        sourceEvent: "invoice.created"
      });
      if (row) queued += 1;
    }
    this.log.log(`invoice.created invoices=${invoiceIds.length} queued=${queued}`);
    return queued;
  }
}
