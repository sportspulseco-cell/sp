import { formatMoney } from "@sportspulse/kernel";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import { playerWebUrl, teamAdminWebUrl } from "../../../../shared/app-urls";
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
        accountEmail: schema.profiles.email,
        invoiceType: schema.invoices.invoiceType,
        teamName: schema.teams.name
      })
      .from(schema.invoices)
      .leftJoin(schema.teams, eq(schema.teams.id, schema.invoices.teamId))
      .leftJoin(schema.persons, eq(schema.persons.id, schema.invoices.recipientPersonId))
      .leftJoin(schema.profiles, eq(schema.profiles.id, schema.persons.userId))
      .where(inArray(schema.invoices.id, invoiceIds));

    const url = `${playerWebUrl(this.config)}/payments`;
    let queued = 0;
    const one = async (inv: (typeof rows)[number]) => {
      if (inv.status === "draft" || inv.status === "void") return;
      const email = inv.accountEmail ?? inv.invoiceEmail ?? null;
      if (!inv.personId && !email) return;
      const amountLabel = formatMoney(inv.totalCents ?? 0, inv.currency || "USD");
      const dueLabel = inv.dueAt
        ? new Date(inv.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
        : "on receipt";
      // A team invoice goes to the captain, who splits it on Dues (UC-16).
      const teamDues = inv.invoiceType === "team_dues";
      const row = await this.notify.queue({
        orgId: inv.orgId,
        templateCode: teamDues ? "team_dues.created" : "invoice.created",
        channel: email ? "email" : "in_app",
        idempotencyKey: `invoice.created:${inv.id}`,
        recipientPersonId: inv.personId,
        recipientEmail: email,
        payload: {
          invoiceNumber: inv.number,
          amountLabel,
          dueLabel,
          invoiceUrl: url,
          invoiceId: inv.id,
          ...(teamDues
            ? {
                teamName: inv.teamName ?? "your team",
                duesUrl: `${teamAdminWebUrl(this.config)}/captain/dues?invoiceId=${inv.id}`
              }
            : {})
        },
        sourceEvent: "invoice.created"
      });
      if (row) queued += 1;
    };
    // Batches of 8, like game notices: a whole roster at once (team split,
    // division invoice) was one round trip per player.
    for (let i = 0; i < rows.length; i += 8) {
      await Promise.all(rows.slice(i, i + 8).map(one));
    }
    this.log.log(`invoice.created invoices=${invoiceIds.length} queued=${queued}`);
    return queued;
  }
}
