/**
 * Staging check of the team-deposit confirmation (team-deposit.ts), run
 * against the real schema inside a transaction that is always rolled back:
 * a test team entry with a master invoice, two player shares and their
 * deposit installments; paying one share must leave the entry applied,
 * paying both must confirm it. Nothing is kept.
 *
 *   DATABASE_URL=<staging> tsx scripts/verify-team-deposit.ts
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { createDb, schema } from "@sportspulse/db";
import { settleInstallments } from "../src/modules/finance/application/services/installments";

class Rollback extends Error {}

async function main() {
const url = process.env.DATABASE_URL;
if (!url || !/panwqcxwtugfqekxnqsr/.test(url)) throw new Error("DATABASE_URL must be the staging database");
const db = createDb({ url, max: 1 });
const results: Array<[string, boolean, string]> = [];
const check = (what: string, ok: boolean, detail = "") => results.push([what, ok, detail]);

try {
  await db.transaction(async (tx) => {
    // A team and a division of the same org where the team has no live entry.
    const [pair] = await tx.execute<{ team_id: string; division_id: string; org_id: string }>(sql`
      select t.id team_id, d.id division_id, t.org_id
        from teams t join divisions d on true join seasons s on s.id = d.season_id
       where s.org_id = t.org_id
         and not exists (select 1 from division_team_entries e where e.team_id = t.id and e.division_id = d.id)
       limit 1`);
    if (!pair) throw new Error("no team/division pair on staging");
    const mk = (n: string, type: string, total: number, parent: string | null) =>
      tx.insert(schema.invoices).values({
        orgId: pair.org_id, invoiceNumber: `VERIFY-${Date.now()}-${n}`, invoiceType: type,
        currency: "USD", subtotalCents: total, totalCents: total, paidCents: 0, status: "sent", parentInvoiceId: parent
      }).returning({ id: schema.invoices.id }).then((r) => r[0]!.id);
    const master = await mk("M", "team_dues", 40000, null);
    const subA = await mk("A", "sub_invoice", 20000, master);
    const subB = await mk("B", "sub_invoice", 20000, master);
    for (const sub of [subA, subB]) {
      await tx.insert(schema.installmentSchedules).values([
        { invoiceId: sub, installmentNumber: 0, dueDate: new Date(), amountCents: 5000, status: "scheduled" },
        { invoiceId: sub, installmentNumber: 1, dueDate: new Date(Date.now() + 30 * 86400000), amountCents: 15000, status: "scheduled" }
      ]);
    }
    const [entry] = await tx.insert(schema.divisionTeamEntries).values({
      teamId: pair.team_id, divisionId: pair.division_id, entryStatus: "applied",
      invoiceId: master, confirmationThresholdCents: 10000
    }).returning({ id: schema.divisionTeamEntries.id });
    const status = async () => (await tx.select({ s: schema.divisionTeamEntries.entryStatus, c: schema.divisionTeamEntries.collectedCents })
      .from(schema.divisionTeamEntries).where(eq(schema.divisionTeamEntries.id, entry!.id)))[0]!;

    // Player A pays their deposit (offline mark-paid raises paid_cents, then settles).
    await tx.update(schema.invoices).set({ paidCents: 5000, status: "partial" }).where(eq(schema.invoices.id, subA));
    await settleInstallments(tx, subA);
    let s = await status();
    check("one deposit paid: entry stays applied", s.s === "applied", `${s.s} collected=${s.c}`);
    check("one deposit paid: collected is 5000", s.c === 5000, String(s.c));

    // Player B pays: deposits now meet the 10000 threshold.
    await tx.update(schema.invoices).set({ paidCents: 5000, status: "partial" }).where(eq(schema.invoices.id, subB));
    await settleInstallments(tx, subB);
    s = await status();
    check("both deposits paid: entry confirmed", s.s === "confirmed", `${s.s} collected=${s.c}`);

    // Settling again changes nothing (idempotent).
    await settleInstallments(tx, subB);
    s = await status();
    check("settling again keeps it confirmed", s.s === "confirmed" && s.c === 10000, `${s.s} ${s.c}`);

    // An invoice outside any team entry is ignored.
    const loose = await mk("L", "standard", 1000, null);
    await tx.update(schema.invoices).set({ paidCents: 1000 }).where(and(eq(schema.invoices.id, loose), isNull(schema.invoices.parentInvoiceId)));
    await settleInstallments(tx, loose);
    check("a non-team invoice settles without error", true);
    throw new Rollback();
  });
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}
for (const [w, ok, d] of results) console.log(`${ok ? "PASS" : "FAIL"} ${w}${d ? ` -- ${d}` : ""}`);
console.log(`${results.filter((r) => r[1]).length}/${results.length} passed (rolled back, nothing kept)`);
process.exit(results.every((r) => r[1]) ? 0 : 1);
}

void main();
