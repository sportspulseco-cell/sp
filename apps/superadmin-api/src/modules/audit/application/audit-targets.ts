import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@sportspulse/db";

/**
 * Where an audited URL's records live, so the audit interceptor can
 * (1) read the row as it was before the change (`before`) and
 * (2) file the event under the record's organisation (`org_id`), which
 * the org-admin activity log filters on.
 *
 * Keyed by the URL segment that names the resource (the same segment the
 * interceptor uses for `resource_type`). `orgOf` is a scalar subquery on
 * the record id. Types missing here still get an audit row, without a
 * before snapshot and with the org only when the response carries one.
 */
interface Target {
  table: string;
  orgOf: (id: string) => SQL;
}

const viaSeason = (table: string) => (id: string) =>
  sql`(select coalesce(s.org_id, l.org_id) from ${sql.raw(table)} x join seasons s on s.id = x.season_id left join leagues l on l.id = s.league_id where x.id = ${id}::uuid)`;
const viaTeam = (table: string) => (id: string) =>
  sql`(select t.org_id from ${sql.raw(table)} x join teams t on t.id = x.team_id where x.id = ${id}::uuid)`;
const own = (table: string) => (id: string) =>
  sql`(select org_id from ${sql.raw(table)} where id = ${id}::uuid)`;

export const AUDIT_TARGETS: Record<string, Target> = {
  orgs: { table: "orgs", orgOf: (id) => sql`(select id from orgs where id = ${id}::uuid)` },
  organizations: { table: "orgs", orgOf: (id) => sql`(select id from orgs where id = ${id}::uuid)` },
  leagues: { table: "leagues", orgOf: own("leagues") },
  seasons: {
    table: "seasons",
    orgOf: (id) =>
      sql`(select coalesce(s.org_id, l.org_id) from seasons s left join leagues l on l.id = s.league_id where s.id = ${id}::uuid)`
  },
  divisions: { table: "divisions", orgOf: viaSeason("divisions") },
  teams: { table: "teams", orgOf: own("teams") },
  games: {
    table: "games",
    orgOf: (id) => sql`(select l.org_id from games g join leagues l on l.id = g.league_id where g.id = ${id}::uuid)`
  },
  "game-events": {
    table: "game_events",
    orgOf: (id) =>
      sql`(select l.org_id from game_events e join games g on g.id = e.game_id join leagues l on l.id = g.league_id where e.id = ${id}::uuid)`
  },
  venues: { table: "venues", orgOf: own("venues") },
  surfaces: {
    table: "surfaces",
    orgOf: (id) => sql`(select v.org_id from surfaces x join venues v on v.id = x.venue_id where x.id = ${id}::uuid)`
  },
  "ice-slots": { table: "ice_slots", orgOf: viaSeason("ice_slots") },
  forms: { table: "registration_forms", orgOf: own("registration_forms") },
  versions: {
    table: "registration_form_versions",
    orgOf: (id) =>
      sql`(select f.org_id from registration_form_versions v join registration_forms f on f.id = v.form_id where v.id = ${id}::uuid)`
  },
  registrations: { table: "registrations", orgOf: own("registrations") },
  submissions: { table: "registrations", orgOf: own("registrations") },
  "pricing-tiers": { table: "pricing_tiers", orgOf: viaSeason("pricing_tiers") },
  "email-templates": { table: "email_templates", orgOf: viaSeason("email_templates") },
  "free-agent-pool": { table: "free_agent_pool_entries", orgOf: viaSeason("free_agent_pool_entries") },
  "team-invites": { table: "team_invites", orgOf: viaTeam("team_invites") },
  "team-join-requests": { table: "team_join_requests", orgOf: viaTeam("team_join_requests") },
  "division-team-entries": { table: "division_team_entries", orgOf: viaTeam("division_team_entries") },
  invoices: { table: "invoices", orgOf: own("invoices") },
  "document-submissions": { table: "compliance_document_submissions", orgOf: own("compliance_document_submissions") },
  orders: { table: "team_store_orders", orgOf: own("team_store_orders") },
  "role-assignments": {
    table: "user_role_assignments",
    orgOf: (id) => sql`(select case a.scope_type
        when 'org' then a.scope_id
        when 'league' then (select org_id from leagues where id = a.scope_id)
        when 'season' then (select coalesce(s.org_id, l.org_id) from seasons s left join leagues l on l.id = s.league_id where s.id = a.scope_id)
        when 'division' then (select s.org_id from divisions d join seasons s on s.id = d.season_id where d.id = a.scope_id)
        when 'team' then (select org_id from teams where id = a.scope_id)
      end from user_role_assignments a where a.id = ${id}::uuid)`
  }
};

/** Keys never copied into an audit snapshot. */
const SECRET_KEY = /password|secret|token|key_hash|p256dh|auth_key/i;

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const r = result as { rows?: unknown[] } | unknown[];
  return (Array.isArray(r) ? r : (r?.rows ?? [])) as Array<Record<string, unknown>>;
}

/** The record as it is now (call before the change), minus secrets. */
export async function snapshotRow(
  db: Database,
  resourceType: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const t = AUDIT_TARGETS[resourceType];
  if (!t) return null;
  const rows = rowsOf(
    await db.execute(sql`select to_jsonb(x) as row from ${sql.raw(t.table)} x where x.id = ${id}::uuid limit 1`)
  );
  const row = rows[0]?.row as Record<string, unknown> | undefined;
  if (!row) return null;
  for (const k of Object.keys(row)) if (SECRET_KEY.test(k)) row[k] = "[redacted]";
  return row;
}

/**
 * The organisation of the first target in `candidates` (nearest the end
 * of the URL first) that resolves to one.
 */
export async function resolveAuditOrg(
  db: Database,
  candidates: Array<{ resourceType: string; id: string }>
): Promise<string | null> {
  for (const c of candidates) {
    const t = AUDIT_TARGETS[c.resourceType];
    if (!t) continue;
    const rows = rowsOf(await db.execute(sql`select ${t.orgOf(c.id)} as org_id`));
    const org = rows[0]?.org_id;
    if (typeof org === "string" && org) return org;
  }
  return null;
}
