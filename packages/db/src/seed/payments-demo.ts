/**
 * Payment & Invoicing demo seed.
 *
 * Populates every tab at /payments with realistic-looking data so
 * stakeholders can walk the flow:
 *
 *   AR dashboard       — 3 invoices in different statuses
 *   Player invoice     — INV-DEMO-001 (partial, $4,365 with line items
 *                         + a $1,000 deposit payment + card-on-file
 *                         metadata + upcoming installments)
 *   Dues split         — Lock Monsters team invoice with 6 player
 *                         splits across paid / partial / pending /
 *                         overdue states
 *   Refund / credit    — One succeeded wallet-credit refund on top
 *                         of INV-DEMO-001 so the history list paints
 *   Wallet             — Johnny Kula's wallet @ $250 with 3 ledger
 *                         entries (issued / applied / issued)
 *   Overdue            — INV-DEMO-002 with an active escalation row
 *                         (level 2, 4 reminders sent)
 *   QB sync footer     — 3 succeeded sync events
 *
 * Idempotent: every demo row is tagged with metadata.demoTag = the
 * SEED_TAG below. Re-running wipes prior demo rows by that tag and
 * re-inserts fresh, so dates always look "fresh" relative to today.
 *
 * Run with:
 *   pnpm --filter @sportspulse/db seed:payments-demo
 *
 * Prerequisite: migrations 0017 + 0018 applied.
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../schema";

const SEED_TAG = "payments-demo-v1";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");
  const conn = postgres(url, { max: 1, ssl: "require" });
  const db = drizzle(conn, { schema, casing: "snake_case" });

  // ─── Sanity check: required new tables exist ───
  try {
    await db.select().from(schema.refunds).limit(1);
    await db.select().from(schema.walletAccounts).limit(1);
    await db.select().from(schema.invoiceEscalations).limit(1);
    await db.select().from(schema.quickbooksSyncLogs).limit(1);
  } catch (err) {
    console.error(
      "❌  One of the new finance-extension tables is missing. Apply migrations 0017 + 0018 first."
    );
    console.error(err);
    process.exit(1);
  }

  // ─── Anchor org ───
  const [org] = await db.select().from(schema.orgs).limit(1);
  if (!org) {
    console.error(
      "❌  No org found. Create at least one organisation before seeding the payments demo."
    );
    process.exit(1);
  }
  console.log(`Using org: ${org.displayName ?? org.legalName} (${org.id})`);

  // ─── Wipe prior demo rows by tag ───
  console.log("Wiping prior demo rows…");

  // Children first to avoid FK violations (cascades cover most, but
  // some FKs use SET NULL / RESTRICT — explicit cleanup is safer).
  await db
    .delete(schema.quickbooksSyncLogs)
    .where(sql`${schema.quickbooksSyncLogs.metadata}->>'demoTag' = ${SEED_TAG}`);
  await db
    .delete(schema.overdueReminderLog)
    .where(sql`${schema.overdueReminderLog.metadata}->>'demoTag' = ${SEED_TAG}`);
  await db
    .delete(schema.invoiceEscalations)
    .where(sql`${schema.invoiceEscalations.metadata}->>'demoTag' = ${SEED_TAG}`);
  await db
    .delete(schema.walletLedger)
    .where(sql`${schema.walletLedger.metadata}->>'demoTag' = ${SEED_TAG}`);
  await db
    .delete(schema.refunds)
    .where(sql`${schema.refunds.metadata}->>'demoTag' = ${SEED_TAG}`);
  await db
    .delete(schema.walletAccounts)
    .where(sql`${schema.walletAccounts.metadata}->>'demoTag' = ${SEED_TAG}`);
  await db
    .delete(schema.teamInvoiceSplits)
    .where(sql`${schema.teamInvoiceSplits.metadata}->>'demoTag' = ${SEED_TAG}`);
  // Payments + invoice items get cleaned via cascade when invoices die.
  await db
    .delete(schema.invoices)
    .where(sql`${schema.invoices.metadata}->>'demoTag' = ${SEED_TAG}`);
  // Persons + teams + seasons we keep across runs (re-use to avoid
  // reseeding the league hierarchy each time).

  // ─── Resolve / create demo persons ───
  // Convention: the legal name doubles as the demo lookup key.
  const PERSONS_DEMO = [
    { first: "Johnny", last: "Kula", isCaptain: true },
    { first: "Mike", last: "Rooney", isCaptain: false },
    { first: "Lisa", last: "Park", isCaptain: false },
    { first: "Tom", last: "Daly", isCaptain: false },
    { first: "Chris", last: "Walsh", isCaptain: false },
    { first: "Brett", last: "Nolan", isCaptain: false },
    { first: "Mike", last: "Patterson", isCaptain: false }
  ];

  const personIds: Record<string, string> = {};
  for (const p of PERSONS_DEMO) {
    const [existing] = await db
      .select({ id: schema.persons.id })
      .from(schema.persons)
      .where(
        and(
          eq(schema.persons.legalFirstName, p.first),
          eq(schema.persons.legalLastName, p.last)
        )
      )
      .limit(1);
    if (existing) {
      personIds[`${p.first} ${p.last}`] = existing.id;
    } else {
      const [created] = await db
        .insert(schema.persons)
        .values({
          legalFirstName: p.first,
          legalLastName: p.last,
          metadata: { demoTag: SEED_TAG }
        })
        .returning({ id: schema.persons.id });
      personIds[`${p.first} ${p.last}`] = created!.id;
    }
  }
  console.log(`Demo persons ready: ${Object.keys(personIds).length}`);

  // ─── Resolve / create a demo team (Lock Monsters) ───
  const teamName = "Lock Monsters (demo)";
  let [team] = await db
    .select()
    .from(schema.teams)
    .where(and(eq(schema.teams.orgId, org.id), eq(schema.teams.name, teamName)))
    .limit(1);
  if (!team) {
    // Need a sportCode — pick any seeded sport.
    const [sport] = await db
      .select({ code: schema.sports.code })
      .from(schema.sports)
      .limit(1);
    if (!sport) throw new Error("No sports seeded; run pnpm --filter @sportspulse/db seed first.");
    const [created] = await db
      .insert(schema.teams)
      .values({
        orgId: org.id,
        sportCode: sport.code,
        name: teamName,
        shortName: "LMD",
        // teams.metadata doesn't exist — externalIds is the JSONB
        // field on this table. Tagging there keeps re-runs detectable.
        externalIds: { demoTag: SEED_TAG }
      })
      .returning();
    team = created!;
  }
  console.log(`Team: ${team.name} (${team.id})`);

  // ─── Build invoices ───
  console.log("Inserting invoices…");
  const johnnyId = personIds["Johnny Kula"]!;
  const mikePattersonId = personIds["Mike Patterson"]!;

  // Invoice 1 — Player invoice tab. Partial, $4,365.
  const [invoice1] = await db
    .insert(schema.invoices)
    .values({
      orgId: org.id,
      invoiceNumber: `INV-DEMO-001-${Math.floor(Math.random() * 10_000)}`,
      recipientPersonId: johnnyId,
      currency: "USD",
      subtotalCents: 485_000,
      discountCents: 48_500,
      totalCents: 436_500,
      paidCents: 100_000,
      status: "partial",
      issuedAt: daysAgo(30),
      dueAt: daysFromNow(24),
      notes: "Demo invoice — Player invoice tab",
      metadata: {
        demoTag: SEED_TAG,
        cardOnFile: { brand: "Visa", last4: "4242", expMonth: 9, expYear: 2027 },
        upcoming: [
          {
            label: "Installment 1",
            dueAt: daysFromNow(24).toISOString(),
            amountCents: 168_250,
            status: "upcoming"
          },
          {
            label: "Installment 2",
            dueAt: daysFromNow(54).toISOString(),
            amountCents: 168_250,
            status: "scheduled"
          }
        ]
      }
    })
    .returning();
  const inv1 = invoice1!;

  await db.insert(schema.invoiceItems).values([
    {
      invoiceId: inv1.id,
      kind: "registration_fee",
      description: "Full season registration (AHL)",
      quantity: 1,
      unitAmountCents: 485_000,
      amountCents: 485_000
    },
    {
      invoiceId: inv1.id,
      kind: "discount",
      description: "Discount code EARLYBIRD10 (10%)",
      quantity: 1,
      unitAmountCents: -48_500,
      amountCents: -48_500
    },
    {
      invoiceId: inv1.id,
      kind: "late_fee",
      description: "Late fee (waived)",
      quantity: 1,
      unitAmountCents: 0,
      amountCents: 0
    }
  ]);

  await db.insert(schema.payments).values({
    orgId: org.id,
    invoiceId: inv1.id,
    amountCents: 100_000,
    currency: "USD",
    method: "credit_card",
    status: "succeeded",
    receivedAt: daysAgo(5),
    notes: "Deposit paid",
    metadata: {
      demoTag: SEED_TAG,
      card: { brand: "Visa", last4: "4242", expMonth: 9, expYear: 2027 }
    }
  });

  // Invoice 2 — Overdue tab. $3,900 + $25 late fee, 21 days past due.
  const [invoice2] = await db
    .insert(schema.invoices)
    .values({
      orgId: org.id,
      invoiceNumber: `INV-DEMO-002-${Math.floor(Math.random() * 10_000)}`,
      recipientPersonId: mikePattersonId,
      currency: "USD",
      subtotalCents: 390_000,
      totalCents: 390_000,
      paidCents: 0,
      status: "overdue",
      issuedAt: daysAgo(60),
      dueAt: daysAgo(21),
      notes: "Demo invoice — Overdue queue (Mike Patterson · Ice Hawks / CHL 1)",
      metadata: { demoTag: SEED_TAG, lateFeeCents: 2500 }
    })
    .returning();
  const inv2 = invoice2!;

  await db.insert(schema.invoiceItems).values({
    invoiceId: inv2.id,
    kind: "registration_fee",
    description: "Full season registration (CHL 1)",
    quantity: 1,
    unitAmountCents: 390_000,
    amountCents: 390_000
  });

  // Invoice 3 — Dues split tab. Team invoice for Lock Monsters.
  // 6 demo players × $2,910 = $17,460. 4 paid in full + 1 partial = ~75% collected.
  const splitPlayers = [
    { name: "Johnny Kula", status: "paid", collected: 291_000 },
    { name: "Mike Rooney", status: "paid", collected: 291_000 },
    { name: "Lisa Park", status: "paid", collected: 291_000 },
    { name: "Tom Daly", status: "paid", collected: 291_000 },
    { name: "Chris Walsh", status: "partial", collected: 145_500 },
    { name: "Brett Nolan", status: "overdue", collected: 0 }
  ];
  const teamTotal = splitPlayers.length * 291_000;
  const teamCollected = splitPlayers.reduce((s, p) => s + p.collected, 0);

  const [invoice3] = await db
    .insert(schema.invoices)
    .values({
      orgId: org.id,
      invoiceNumber: `INV-DEMO-TEAM-${Math.floor(Math.random() * 10_000)}`,
      recipientPersonId: johnnyId,
      currency: "USD",
      subtotalCents: teamTotal,
      totalCents: teamTotal,
      paidCents: teamCollected,
      status: "partial",
      issuedAt: daysAgo(20),
      dueAt: daysFromNow(40),
      notes: "Demo team invoice — Dues split tab (Lock Monsters)",
      metadata: { demoTag: SEED_TAG, teamId: team.id }
    })
    .returning();
  const inv3 = invoice3!;

  // Splits
  await db.insert(schema.teamInvoiceSplits).values(
    splitPlayers.map((p) => ({
      invoiceId: inv3.id,
      teamId: team.id,
      playerPersonId: personIds[p.name]!,
      allocatedCents: 291_000,
      collectedCents: p.collected,
      status: p.status,
      metadata: { demoTag: SEED_TAG }
    }))
  );

  console.log("Inserted 3 invoices + line items + payments + 6 splits");

  // ─── Wallet for Johnny Kula ($250 balance, 3 ledger entries) ───
  const [wallet] = await db
    .insert(schema.walletAccounts)
    .values({
      personId: johnnyId,
      orgId: org.id,
      currency: "USD",
      balanceCents: 25_000,
      metadata: { demoTag: SEED_TAG }
    })
    .returning();
  const w = wallet!;

  await db.insert(schema.walletLedger).values([
    // Order matches the mockup: most recent at top.
    {
      walletId: w.id,
      entryType: "credit_issued",
      amountCents: 25_000,
      reason: "Admin credit — registration adjustment",
      createdAt: daysAgo(30),
      metadata: { demoTag: SEED_TAG }
    },
    {
      walletId: w.id,
      entryType: "credit_applied",
      amountCents: -48_500,
      reason: "Applied to INV-2024-07122 (Winter 2024)",
      createdAt: daysAgo(180),
      metadata: { demoTag: SEED_TAG }
    },
    {
      walletId: w.id,
      entryType: "credit_issued",
      amountCents: 48_500,
      reason: "Refund credit — season cancellation",
      createdAt: daysAgo(220),
      metadata: { demoTag: SEED_TAG }
    }
  ]);

  console.log("Wallet seeded for Johnny Kula @ $250.00 with 3 ledger entries");

  // ─── A succeeded refund on Invoice 1 so the Refund history list paints ───
  await db.insert(schema.refunds).values({
    orgId: org.id,
    invoiceId: inv1.id,
    refundType: "wallet_credit",
    amountCents: 25_000,
    currency: "USD",
    reason: "Demo refund — late-arrival adjustment, issued as wallet credit per league policy.",
    status: "succeeded",
    processedAt: daysAgo(30),
    metadata: { demoTag: SEED_TAG }
  });

  // ─── Escalation on Invoice 2 ───
  const [escalation] = await db
    .insert(schema.invoiceEscalations)
    .values({
      invoiceId: inv2.id,
      level: 2,
      remindersSent: 4,
      lastReminderAt: daysAgo(3),
      lockSuspended: false,
      metadata: { demoTag: SEED_TAG }
    })
    .returning();
  const esc = escalation!;

  // 4 reminder log entries
  for (let i = 0; i < 4; i++) {
    await db.insert(schema.overdueReminderLog).values({
      escalationId: esc.id,
      invoiceId: inv2.id,
      channel: "email",
      templateCode: "overdue_reminder_default",
      status: "sent",
      sentAt: daysAgo(3 + i * 4),
      metadata: { demoTag: SEED_TAG }
    });
  }

  console.log("Inserted 1 refund + 1 escalation + 4 reminder log entries");

  // ─── QuickBooks sync log entries ───
  await db.insert(schema.quickbooksSyncLogs).values([
    {
      orgId: org.id,
      entityType: "payment",
      entityId: inv1.id,
      qbId: "QBP-50421",
      action: "create",
      status: "succeeded",
      summary: `Payment confirmed · ${inv1.invoiceNumber} · $1,000 · QB Payment created`,
      attemptedAt: daysAgo(0.001), // ~2 minutes ago
      metadata: { demoTag: SEED_TAG }
    },
    {
      orgId: org.id,
      entityType: "invoice",
      entityId: inv2.id,
      qbId: "QBI-50420",
      action: "update",
      status: "succeeded",
      summary: `Late fee applied · ${inv2.invoiceNumber} · $25 · QB Invoice updated`,
      attemptedAt: daysAgo(0.008),
      metadata: { demoTag: SEED_TAG }
    },
    {
      orgId: org.id,
      entityType: "credit_memo",
      entityId: inv1.id,
      qbId: "QBC-50419",
      action: "create",
      status: "succeeded",
      summary: `Refund issued · ${inv1.invoiceNumber} · $250 · QB Credit Memo created`,
      attemptedAt: daysAgo(0.024),
      metadata: { demoTag: SEED_TAG }
    }
  ]);

  console.log("Inserted 3 QB sync events");

  // ─── Print deep-link URLs ───
  const baseUrl =
    process.env.NEXT_PUBLIC_SUPERADMIN_WEB_URL ??
    "https://sp-superadmin.vercel.app";

  console.log("\n" + "─".repeat(60));
  console.log("Demo data seeded — open these URLs:");
  console.log("─".repeat(60));
  console.log(`AR dashboard      ${baseUrl}/payments?tab=ar`);
  console.log(
    `Player invoice    ${baseUrl}/payments?tab=invoice&invoiceId=${inv1.id}`
  );
  console.log(
    `Dues split        ${baseUrl}/payments?tab=split&invoiceId=${inv3.id}&teamId=${team.id}`
  );
  console.log(
    `Refund / credit   ${baseUrl}/payments?tab=refund&invoiceId=${inv1.id}`
  );
  console.log(
    `Wallet            ${baseUrl}/payments?tab=wallet&personId=${johnnyId}`
  );
  console.log(`Overdue           ${baseUrl}/payments?tab=overdue`);
  console.log("─".repeat(60));
  console.log(
    "\nRe-run anytime with `pnpm --filter @sportspulse/db seed:payments-demo` —"
  );
  console.log(
    "demo rows are tagged with metadata.demoTag and replaced cleanly each run."
  );

  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
