import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  check
} from "drizzle-orm/pg-core";
import { inet } from "./_helpers";
import { authUsers } from "./auth";
import { orgs } from "./iam";

// Append-only cross-cutting audit log
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tsUtc: timestamp("ts_utc", { withTimezone: true })
      .notNull()
      .defaultNow(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => authUsers.id, {
      onDelete: "set null"
    }),
    onBehalfOfUserId: uuid("on_behalf_of_user_id").references(
      () => authUsers.id,
      { onDelete: "set null" }
    ),
    action: text("action").notNull(), // e.g. "profile.updated"
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipAddr: inet("ip_addr"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    retentionClass: text("retention_class").notNull().default("default"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    retentionCheck: check(
      "audit_events_retention_check",
      sql`${t.retentionClass} IN ('default','financial','legal_hold')`
    ),
    orgTsIdx: index("audit_events_org_ts_idx").on(t.orgId, t.tsUtc.desc()),
    actorTsIdx: index("audit_events_actor_ts_idx").on(
      t.actorUserId,
      t.tsUtc.desc()
    ),
    resourceIdx: index("audit_events_resource_idx").on(
      t.resourceType,
      t.resourceId
    ),
    actionTsIdx: index("audit_events_action_ts_idx").on(
      t.action,
      t.tsUtc.desc()
    )
  })
);
