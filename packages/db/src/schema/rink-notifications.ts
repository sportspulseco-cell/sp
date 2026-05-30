import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check
} from "drizzle-orm/pg-core";
import { authUsers } from "./auth";
import { venues } from "./scheduling";
import { games } from "./game";

// =====================================================================
// RINK NOTIFICATIONS — direct integrations + outbox (pain #2).
//
// Avario's "change notify" button broke because of a 3-vendor API chain
// (Avario → Sea Coast → Horizon) that silently dropped notifications.
// SportsPulse owns the delivery: per-venue endpoint config + an outbox
// with retry + circuit-breaker state, so every send is visible and
// recoverable.
// =====================================================================

export const rinkIntegrations = pgTable(
  "rink_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    /** webhook | email | sportsengine | crossbar | horizon | manual */
    kind: text("kind").notNull(),
    /** For `webhook` — the URL we POST to. NULL for email/manual. */
    endpointUrl: text("endpoint_url"),
    /** Optional auth header name (e.g. `X-Api-Key`). */
    authHeaderName: text("auth_header_name"),
    /** Reference into Supabase Vault, NOT the raw secret. */
    authSecretRef: text("auth_secret_ref"),
    contactEmail: text("contact_email"),
    active: boolean("active").notNull().default(true),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
    /** closed | open | half_open — circuit-breaker state. */
    circuitState: text("circuit_state").notNull().default("closed"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    kindCheck: check(
      "rink_integration_kind_check",
      sql`${t.kind} IN ('webhook','email','sportsengine','crossbar','horizon','manual')`
    ),
    circuitCheck: check(
      "rink_integration_circuit_check",
      sql`${t.circuitState} IN ('closed','open','half_open')`
    ),
    venueIdx: index("rink_integration_venue_idx").on(t.venueId),
    activeIdx: index("rink_integration_active_idx").on(t.active)
  })
);

export const rinkNotificationOutbox = pgTable(
  "rink_notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
    rinkIntegrationId: uuid("rink_integration_id")
      .notNull()
      .references(() => rinkIntegrations.id, { onDelete: "cascade" }),
    /** game_scheduled | game_rescheduled | game_cancelled | game_postponed */
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    /** sha256 of (game_id, event_type, integration_id, slot_id) — dedup. */
    idempotencyKey: text("idempotency_key").notNull(),
    /** pending | delivered | failed | dead_letter */
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    eventCheck: check(
      "rink_notification_event_check",
      sql`${t.eventType} IN ('game_scheduled','game_rescheduled','game_cancelled','game_postponed')`
    ),
    statusCheck: check(
      "rink_notification_status_check",
      sql`${t.status} IN ('pending','delivered','failed','dead_letter')`
    ),
    idempotencyUniq: uniqueIndex("rink_notification_idempotency_uniq").on(
      t.idempotencyKey
    ),
    statusIdx: index("rink_notification_status_idx").on(
      t.status,
      t.nextRetryAt
    ),
    integrationIdx: index("rink_notification_integration_idx").on(
      t.rinkIntegrationId
    )
  })
);
