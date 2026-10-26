import { BadRequestException, Controller, Get, Inject, Logger, NotFoundException, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { AGING_BUCKETS, agingBucket } from "@sportspulse/kernel";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { orgVisible, visibleInvoicesWhere } from "../../../shared/auth/visibility";
import { toCsv } from "../../reports/application/csv";

const KINDS = ["invoices", "payments", "refunds", "aging", "team_balances", "player_balances"] as const;
type Kind = (typeof KINDS)[number];

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : ((r as { rows?: Row[] }).rows ?? []));
const dollars = (cents: unknown) => (Number(cents ?? 0) / 100).toFixed(2);

/**
 * Financial reports for accounting (FR-3.1.4) and balances per team and
 * per player (FR-3.1.1). Scoped like the invoice list: a super admin sees
 * everything, an org or league admin only invoices inside their scope
 * (visibleInvoicesWhere). The invoice export uses the same filters as the
 * Invoices list (org, status, scope, search) so its rows are the rows on
 * screen; the aging export and the balances use the AR tiles' rule (open
 * invoices, a team invoice already split into shares counted once, as its
 * shares).
 */
@ApiTags("finance/reports")
@ApiBearerAuth()
@Controller("finance")
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class FinanceReportsController {
  private readonly log = new Logger(FinanceReportsController.name);
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private where(scope: UserScopeType, q: { orgId?: string; status?: string; billingScope?: string; search?: string }): SQL {
    if (q.orgId && !orgVisible(scope, q.orgId)) throw new NotFoundException("Org not found");
    const parts: SQL[] = [visibleInvoicesWhere(scope, "i") ?? sql`true`];
    if (q.orgId) parts.push(sql`i.org_id = ${q.orgId}::uuid`);
    if (q.status) parts.push(sql`i.status = ${q.status}`);
    if (q.billingScope) parts.push(sql`i.billing_scope = ${q.billingScope}`);
    if (q.search) parts.push(sql`(i.invoice_number ilike ${`%${q.search}%`} or i.recipient_email ilike ${`%${q.search}%`})`);
    return sql.join(parts, sql` and `);
  }

  /** Open balances, team invoices already split counted as their shares (the AR tiles' rule). */
  private openWhere(scope: UserScopeType, orgId?: string): SQL {
    return sql`${this.where(scope, { orgId })}
      and i.status in ('sent','partial','overdue') and i.total_cents > i.paid_cents
      and not (i.invoice_type = 'team_dues' and exists (select 1 from invoices c where c.parent_invoice_id = i.id))`;
  }

  @Get("balances")
  @ApiOperation({ summary: "Balances per team and per player (open invoices), scoped like the invoice list." })
  async balances(@UserScope() scope: UserScopeType, @Query("orgId") orgId?: string) {
    const [teams, players] = await Promise.all([this.teamBalances(scope, orgId), this.playerBalances(scope, orgId)]);
    return { teams, players };
  }

  private async teamBalances(scope: UserScopeType, orgId?: string) {
    const r = await this.db.execute(sql`
      select t.id as team_id, t.name as team_name, count(*)::int as open_invoices,
             sum(i.total_cents)::int as billed_cents, sum(i.paid_cents)::int as paid_cents,
             sum(i.total_cents - i.paid_cents)::int as outstanding_cents,
             coalesce(sum(i.total_cents - i.paid_cents) filter (where i.status = 'overdue'), 0)::int as overdue_cents
        from invoices i
        join teams t on t.id = coalesce(i.team_id, (select p.team_id from invoices p where p.id = i.parent_invoice_id))
       where ${this.openWhere(scope, orgId)}
       group by t.id, t.name
       order by outstanding_cents desc, t.name
       limit 500`);
    return rowsOf(r).map((x) => ({
      teamId: String(x.team_id), teamName: String(x.team_name), openInvoices: Number(x.open_invoices),
      billedCents: Number(x.billed_cents), paidCents: Number(x.paid_cents), outstandingCents: Number(x.outstanding_cents), overdueCents: Number(x.overdue_cents)
    }));
  }

  private async playerBalances(scope: UserScopeType, orgId?: string) {
    const r = await this.db.execute(sql`
      select i.recipient_person_id as person_id,
             nullif(trim(concat_ws(' ', max(p.legal_first_name), max(p.legal_last_name))), '') as name,
             max(i.recipient_email) as email, count(*)::int as open_invoices,
             sum(i.total_cents - i.paid_cents)::int as outstanding_cents,
             coalesce(sum(i.total_cents - i.paid_cents) filter (where i.status = 'overdue'), 0)::int as overdue_cents
        from invoices i
        left join persons p on p.id = i.recipient_person_id
       where ${this.openWhere(scope, orgId)} and i.recipient_person_id is not null
       group by i.recipient_person_id
       order by outstanding_cents desc
       limit 500`);
    return rowsOf(r).map((x) => ({
      personId: String(x.person_id), name: (x.name as string | null) ?? null, email: (x.email as string | null) ?? null,
      openInvoices: Number(x.open_invoices), outstandingCents: Number(x.outstanding_cents), overdueCents: Number(x.overdue_cents)
    }));
  }

  @Get("export")
  @ApiOperation({
    summary:
      "CSV export for accounting: kind = invoices | payments | refunds | aging | team_balances | player_balances. Returns { filename, csv, rowCount }; scoped like the invoice list."
  })
  async export(
    @UserScope() scope: UserScopeType,
    @Query("kind") kind: string,
    @Query("orgId") orgId?: string,
    @Query("status") status?: string,
    @Query("billingScope") billingScope?: string,
    @Query("search") search?: string
  ): Promise<{ filename: string; csv: string; rowCount: number }> {
    if (!KINDS.includes(kind as Kind)) throw new BadRequestException(`kind must be one of ${KINDS.join(", ")}`);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${kind.replace("_", "-")}-${orgId ? orgId.slice(0, 8) + "-" : ""}${stamp}.csv`;
    let rows: Row[] = [];
    let columns: string[] = [];
    if (kind === "invoices") {
      const r = await this.db.execute(sql`
        select i.invoice_number, i.invoice_type, i.billing_scope, i.status,
               nullif(trim(concat_ws(' ', p.legal_first_name, p.legal_last_name)), '') as recipient, i.recipient_email,
               i.total_cents, i.discount_cents, i.late_fee_applied_cents, i.paid_cents, (i.total_cents - i.paid_cents) as outstanding_cents,
               i.currency, i.issued_at, i.due_at, i.paid_at, i.created_at
          from invoices i left join persons p on p.id = i.recipient_person_id
         where ${this.where(scope, { orgId, status, billingScope, search })}
         order by i.created_at desc`);
      columns = ["invoice_number", "type", "billing_scope", "status", "recipient", "email", "total", "discount", "late_fee", "paid", "outstanding", "currency", "issued_at", "due_at", "paid_at", "created_at"];
      rows = rowsOf(r).map((x) => ({
        invoice_number: x.invoice_number, type: x.invoice_type, billing_scope: x.billing_scope, status: x.status, recipient: x.recipient, email: x.recipient_email,
        total: dollars(x.total_cents), discount: dollars(x.discount_cents), late_fee: dollars(x.late_fee_applied_cents), paid: dollars(x.paid_cents),
        outstanding: dollars(x.outstanding_cents), currency: x.currency, issued_at: x.issued_at, due_at: x.due_at, paid_at: x.paid_at, created_at: x.created_at
      }));
    } else if (kind === "payments") {
      const r = await this.db.execute(sql`
        select pay.received_at, i.invoice_number, pay.method, pay.status, pay.amount_cents, pay.currency, pay.external_provider_id, pay.notes
          from payments pay join invoices i on i.id = pay.invoice_id
         where ${this.where(scope, { orgId })}
         order by pay.received_at desc`);
      columns = ["received_at", "invoice_number", "method", "status", "amount", "currency", "reference", "notes"];
      rows = rowsOf(r).map((x) => ({ received_at: x.received_at, invoice_number: x.invoice_number, method: x.method, status: x.status, amount: dollars(x.amount_cents), currency: x.currency, reference: x.external_provider_id, notes: x.notes }));
    } else if (kind === "refunds") {
      const r = await this.db.execute(sql`
        select rf.created_at, i.invoice_number, rf.refund_type, rf.status, rf.amount_cents, rf.currency, rf.reason, rf.processor_refund_id
          from refunds rf join invoices i on i.id = rf.invoice_id
         where ${this.where(scope, { orgId })}
         order by rf.created_at desc`);
      columns = ["created_at", "invoice_number", "refund_type", "status", "amount", "currency", "reason", "reference"];
      rows = rowsOf(r).map((x) => ({ created_at: x.created_at, invoice_number: x.invoice_number, refund_type: x.refund_type, status: x.status, amount: dollars(x.amount_cents), currency: x.currency, reason: x.reason, reference: x.processor_refund_id }));
    } else if (kind === "aging") {
      const r = await this.db.execute(sql`
        select i.invoice_number, i.status, i.recipient_email, i.due_at, (i.total_cents - i.paid_cents) as outstanding_cents, i.currency
          from invoices i where ${this.openWhere(scope, orgId)} order by i.due_at nulls first`);
      const now = new Date();
      const open = rowsOf(r).map((x) => ({ outstanding_cents: Number(x.outstanding_cents), bucket: agingBucket((x.due_at as Date | string | null) ?? null, now) }));
      columns = ["bucket", "invoices", "outstanding"];
      rows = AGING_BUCKETS.map((b) => {
        const inB = open.filter((x) => x.bucket === b);
        return { bucket: b, invoices: inB.length, outstanding: dollars(inB.reduce((s, x) => s + Number(x.outstanding_cents), 0)) };
      });
      rows.push({ bucket: "Total", invoices: open.length, outstanding: dollars(open.reduce((s, x) => s + Number(x.outstanding_cents), 0)) });
    } else if (kind === "team_balances") {
      columns = ["team", "open_invoices", "billed", "paid", "outstanding", "overdue"];
      rows = (await this.teamBalances(scope, orgId)).map((t) => ({ team: t.teamName, open_invoices: t.openInvoices, billed: dollars(t.billedCents), paid: dollars(t.paidCents), outstanding: dollars(t.outstandingCents), overdue: dollars(t.overdueCents) }));
    } else {
      columns = ["player", "email", "open_invoices", "outstanding", "overdue"];
      rows = (await this.playerBalances(scope, orgId)).map((p) => ({ player: p.name, email: p.email, open_invoices: p.openInvoices, outstanding: dollars(p.outstandingCents), overdue: dollars(p.overdueCents) }));
    }
    this.log.log(`finance export kind=${kind} org=${orgId ?? "all"} rows=${rows.length} superAdmin=${scope.isSuperAdmin}`);
    return { filename, csv: toCsv(rows, columns), rowCount: rows.length };
  }
}
