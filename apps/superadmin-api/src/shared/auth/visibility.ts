import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import type { UserScope } from "./scope";

/**
 * What a scoped admin (org / league / season / division admin signed in
 * to the admin console) may read. Super admins and platform-scoped
 * roles are unrestricted (`null` fragments). Everything else is a SQL
 * fragment the repository ANDs into its WHERE, so a league admin never
 * sees another org's rows and never gets a 403 for a page their role
 * is meant to have.
 *
 * League-owned records (seasons, divisions, registrations, forms) use
 * `orgWideOrgIds ∪ leagueIds` (SETUP-15): a league admin sees their own
 * league, not sibling leagues of the same org. Org-owned records
 * (teams, transfers, documents, people) use `orgIds`.
 *
 * Added 24 Oct 2026 after the full-surface crawl: as a league admin,
 * Users / Forms / Registrations / Division applications / Transfers /
 * Eligibility / Documents either said "Super admin access required" or
 * rendered an empty list as if that were the truth.
 */
export interface Visibility {
  scope: UserScope;
  /** The caller: always visible to themselves. */
  userId: string;
}

export function unrestricted(scope: UserScope): boolean {
  return scope.isSuperAdmin || (scope.orgIds === null && scope.leagueIds === null);
}

/** `IN (...)` list; an empty list becomes `(NULL::uuid)`, which matches nothing. */
function uuidList(ids: readonly string[] | null | undefined): SQL {
  const list = ids ?? [];
  return list.length
    ? sql.join(
        list.map((id) => sql`${id}::uuid`),
        sql`, `
      )
    : sql`NULL::uuid`;
}

/** Subquery of season ids the scope may see (league-owned rule). */
export function visibleSeasonIds(scope: UserScope): SQL | null {
  if (unrestricted(scope)) return null;
  return sql`(select s.id from seasons s where s.org_id in (${uuidList(scope.orgWideOrgIds)}) or s.league_id in (${uuidList(scope.leagueIds)}))`;
}

/**
 * Subquery of user ids reachable from the scope: anyone holding a role
 * or an active roster spot inside it, anyone who submitted a
 * registration to it, plus the caller.
 */
export function visibleUserIds(v: Visibility): SQL | null {
  const { scope } = v;
  if (unrestricted(scope)) return null;
  const seasons = visibleSeasonIds(scope)!;
  return sql`(
    select ura.user_id from user_role_assignments ura
    where ura.revoked_at is null and (
      (ura.scope_type = 'org' and ura.scope_id in (${uuidList(scope.orgIds)}))
      or (ura.scope_type = 'league' and ura.scope_id in (${uuidList(scope.leagueIds)}))
      or (ura.scope_type = 'season' and ura.scope_id in ${seasons})
      or (ura.scope_type = 'division' and ura.scope_id in (select d.id from divisions d where d.season_id in ${seasons}))
      or (ura.scope_type = 'team' and ura.scope_id in (select t.id from teams t where t.org_id in (${uuidList(scope.orgIds)})))
    )
    union select p.user_id from persons p
      join team_memberships tm on tm.person_id = p.id and tm.current_status = 'active'
      join teams t on t.id = tm.team_id
      where p.user_id is not null and t.org_id in (${uuidList(scope.orgIds)})
    union select r.submitted_by_user_id from registrations r
      where r.submitted_by_user_id is not null
        and (r.org_id in (${uuidList(scope.orgWideOrgIds)}) or r.league_id in (${uuidList(scope.leagueIds)}) or r.season_id in ${seasons})
    union select ${v.userId}::uuid
  )`;
}

/** WHERE fragment for `registration_forms`: org-wide forms of the scope's orgs, or forms bound to its leagues / seasons / divisions. */
export function visibleFormsWhere(scope: UserScope): SQL | null {
  if (unrestricted(scope)) return null;
  const seasons = visibleSeasonIds(scope)!;
  const f = schema.registrationForms;
  return sql`(
    ${f.orgId} in (${uuidList(scope.orgWideOrgIds)})
    or (${f.scope} = 'league' and ${f.scopeId} in (${uuidList(scope.leagueIds)}))
    or (${f.scope} = 'season' and ${f.scopeId} in ${seasons})
    or (${f.scope} = 'division' and ${f.scopeId} in (select d.id from divisions d where d.season_id in ${seasons}))
    or ${f.seasonId} in ${seasons}
  )`;
}

/** WHERE fragment for `registrations` (player submissions). */
export function visibleRegistrationsWhere(scope: UserScope): SQL | null {
  if (unrestricted(scope)) return null;
  const r = schema.registrations;
  return sql`(${r.orgId} in (${uuidList(scope.orgWideOrgIds)}) or ${r.leagueId} in (${uuidList(scope.leagueIds)}) or ${r.seasonId} in ${visibleSeasonIds(scope)!})`;
}

/** True when the org is one the scope may read. A `null` org is a platform-wide record, visible to everyone. */
export function orgVisible(scope: UserScope, orgId: string | null | undefined): boolean {
  if (unrestricted(scope) || orgId == null) return true;
  return (scope.orgIds ?? []).includes(orgId);
}

function hasRows(result: unknown): boolean {
  const r = result as { length?: number; rows?: unknown[] };
  if (Array.isArray(r)) return r.length > 0;
  return (r?.rows?.length ?? 0) > 0;
}

export async function seasonVisible(
  db: Database,
  scope: UserScope,
  seasonId: string | null | undefined
): Promise<boolean> {
  if (unrestricted(scope)) return true;
  if (!seasonId) return false;
  const rows = await db.execute(
    sql`select 1 from seasons s where s.id = ${seasonId}::uuid and (s.org_id in (${uuidList(scope.orgWideOrgIds)}) or s.league_id in (${uuidList(scope.leagueIds)})) limit 1`
  );
  return hasRows(rows);
}

export async function userVisible(db: Database, v: Visibility, userId: string): Promise<boolean> {
  const sub = visibleUserIds(v);
  if (!sub) return true;
  const rows = await db.execute(sql`select 1 where ${userId}::uuid in ${sub}`);
  return hasRows(rows);
}

export async function formVisible(db: Database, scope: UserScope, formId: string): Promise<boolean> {
  const where = visibleFormsWhere(scope);
  if (!where) return true;
  const rows = await db.execute(
    sql`select 1 from registration_forms where id = ${formId}::uuid and ${where} limit 1`
  );
  return hasRows(rows);
}

export async function registrationVisible(db: Database, scope: UserScope, registrationId: string): Promise<boolean> {
  const where = visibleRegistrationsWhere(scope);
  if (!where) return true;
  const rows = await db.execute(
    sql`select 1 from registrations where id = ${registrationId}::uuid and ${where} limit 1`
  );
  return hasRows(rows);
}

/**
 * Subquery of person ids the caller may see: people linked to a visible
 * user, people on a team of the caller's organisations, and people who
 * registered into the caller's scope (minors without a login included).
 * Callers with no role see only themselves. CAP-11: the people search
 * used to return every person on the platform to any signed-in user.
 */
export function visiblePersonIds(v: Visibility): SQL | null {
  const { scope } = v;
  if (unrestricted(scope)) return null;
  const users = visibleUserIds(v)!;
  const regs = visibleRegistrationsWhere(scope)!;
  return sql`(
    select p.id from persons p where p.user_id in ${users}
    union select tm.person_id from team_memberships tm
      join teams t on t.id = tm.team_id
      where t.org_id in (${uuidList(scope.orgIds)})
    union select registrations.subject_person_id from registrations where ${regs}
  )`;
}

/**
 * WHERE fragment for `compliance_document_submissions` (COMP-1): a
 * document is reviewed by whoever administers what it was submitted
 * for. Season-bound uploads follow the league-owned season rule (a
 * league admin sees their league's seasons, not sibling leagues');
 * registration-bound ones also follow the registration rule; an upload
 * with neither is org-owned (`orgIds`, like teams and people).
 * `alias` is the table alias the caller's query uses.
 */
export function visibleComplianceSubmissionsWhere(scope: UserScope, alias = "cds"): SQL | null {
  if (unrestricted(scope)) return null;
  const a = sql.raw(alias);
  const regs = visibleRegistrationsWhere(scope)!;
  return sql`(
    (${a}.season_id is not null and ${a}.season_id in ${visibleSeasonIds(scope)!})
    or (${a}.registration_id is not null and ${a}.registration_id in (select registrations.id from registrations where ${regs}))
    or (${a}.season_id is null and ${a}.registration_id is null and ${a}.org_id in (${uuidList(scope.orgIds)}))
  )`;
}

/**
 * Whether a person belongs to one organisation by the same rule an org
 * admin's people list uses (visiblePersonIds): a role or roster spot in
 * the org, or a registration into it. MON-20: a bulk invoice addressed to
 * one person must not reach someone outside the billing org.
 */
export async function personInOrg(db: Database, orgId: string, personId: string): Promise<boolean> {
  const orgScope: UserScope = {
    isSuperAdmin: false,
    orgIds: [orgId],
    orgWideOrgIds: [orgId],
    leagueIds: [],
    teamIds: []
  };
  // Nil caller: nobody is "visible to themselves" here.
  return personVisible(db, { scope: orgScope, userId: "00000000-0000-0000-0000-000000000000" }, personId);
}

/**
 * WHERE fragment for `audit_events` (J17): the caller's own actions; every
 * event of an organisation they administer org-wide; and, for league,
 * season and division admins, events on their own leagues, seasons,
 * divisions and games. A league admin used to see the whole org's log,
 * sibling leagues included, because events were filtered by org only.
 */
export function visibleAuditWhere(v: Visibility): SQL | null {
  const { scope } = v;
  if (unrestricted(scope)) return null;
  const seasons = visibleSeasonIds(scope)!;
  const leagues = uuidList(scope.leagueIds);
  return sql`(
    audit_events.actor_user_id = ${v.userId}::uuid
    or audit_events.org_id in (${uuidList(scope.orgWideOrgIds)})
    or (audit_events.resource_type = 'leagues' and audit_events.resource_id in (${leagues}))
    or (audit_events.resource_type in ('seasons', 'season') and audit_events.resource_id in ${seasons})
    or (audit_events.resource_type = 'divisions'
        and audit_events.resource_id in (select d.id from divisions d where d.season_id in ${seasons}))
    or (audit_events.resource_type in ('games', 'start', 'publish')
        and audit_events.resource_id in (select g.id from games g where g.league_id in (${leagues}) or g.season_id in ${seasons}))
  )`;
}

export async function auditEventVisible(db: Database, v: Visibility, eventId: string): Promise<boolean> {
  const where = visibleAuditWhere(v);
  if (!where) return true;
  const rows = await db.execute(sql`select 1 from audit_events where audit_events.id = ${eventId}::uuid and ${where}`);
  return hasRows(rows);
}

export async function personVisible(db: Database, v: Visibility, personId: string): Promise<boolean> {
  const sub = visiblePersonIds(v);
  if (!sub) return true;
  const rows = await db.execute(sql`select 1 where ${personId}::uuid in ${sub}`);
  return hasRows(rows);
}
