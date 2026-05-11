import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { orgs, persons } from "./iam";
import { seasons, teams } from "./league";
import { invoices } from "./finance";

// =====================================================================
// TRANSFER_REQUESTS — Workflow 7B · Case 6 three-actor state machine.
//
// Source captain initiates → destination captain accepts → admin
// approves. Status mutates over this lifecycle; the actual roster
// changes (drop + add) emit roster_moves rows at APPROVAL time so
// roster_moves stays append-only.
// =====================================================================
export const transferRequests = pgTable(
  "transfer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    fromTeamId: uuid("from_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    toTeamId: uuid("to_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /**
     * pending_destination | pending_admin | approved | rejected | cancelled
     */
    status: text("status").notNull().default("pending_destination"),
    reason: text("reason"),
    initiatedByUserId: uuid("initiated_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    initiatedAt: timestamp("initiated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedByUserId: uuid("accepted_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedByUserId: uuid("rejected_by_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    destinationInvoiceId: uuid("destination_invoice_id").references(
      () => invoices.id,
      { onDelete: "set null" }
    ),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    statusCheck: check(
      "transfer_request_status_check",
      sql`${t.status} IN ('pending_destination','pending_admin','approved','rejected','cancelled')`
    ),
    differentTeams: check(
      "transfer_request_different_teams",
      sql`${t.fromTeamId} <> ${t.toTeamId}`
    ),
    statusIdx: index("transfer_requests_status_idx").on(
      t.status,
      t.createdAt
    ),
    orgIdx: index("transfer_requests_org_idx").on(t.orgId, t.status),
    personIdx: index("transfer_requests_person_idx").on(
      t.personId,
      t.seasonId
    ),
    toTeamIdx: index("transfer_requests_to_team_idx").on(
      t.toTeamId,
      t.status
    ),
    fromTeamIdx: index("transfer_requests_from_team_idx").on(
      t.fromTeamId,
      t.status
    ),
    openUniq: uniqueIndex("transfer_requests_open_uniq")
      .on(t.personId, t.seasonId)
      .where(sql`${t.status} IN ('pending_destination','pending_admin')`)
  })
);
