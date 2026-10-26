import { fetchAll, load } from "@sportspulse/api-client";
import {
  ArrowLeft,
  Building2,
  CalendarRange,
  Globe2,
  KeyRound,
  Layers,
  Network,
  Trophy,
  Users,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLink, LoadError } from "@sportspulse/ui";
import {
  crossOrgGrants,
  iam,
  leagueMgmt,
  orgs,
  publicRegistration,
  registration
} from "@/lib/api/server-api";
import { Badge, statusTone } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { LinkOrgButton } from "@/components/orgs/link-org-button";
import { UnlinkRelationButton } from "@/components/orgs/unlink-relation-button";
import { IssueGrantButton } from "@/components/orgs/issue-grant-button";
import { RevokeGrantButton } from "@/components/orgs/revoke-grant-button";
import { RoleAssignmentPanel } from "@/components/roles/role-assignment-panel";
import { RegionsSection } from "@/components/regions/regions-section";
import { OrgActions } from "@/components/edit/detail-actions";

export const metadata = { title: "Organization — SportsPulse" };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default async function OrgDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const orgResult = await load(orgs.get(id));
  if (!orgResult.ok) {
    if (orgResult.status === 404) notFound();
    return (
      <LoadError
        what="this organization"
        status={orgResult.status}
        message={orgResult.message}
        action={
          <Link
            href="/organizations"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            All organizations
          </Link>
        }
      />
    );
  }
  const org = orgResult.data;

  const [
    children,
    parents,
    grants,
    assignments,
    roles,
    seasonsPage,
    leaguesPage,
    teamsPage,
    registrationsPage,
    allOrgsPage,
    appLinks
  ] = await Promise.all([
    orgs.listChildren(id).catch(() => []),
    orgs.listParents(id).catch(() => []),
    crossOrgGrants.list({ orgId: id }).catch(() => []),
    iam
      .listRoleAssignments({ scopeType: "org", scopeId: id, activeOnly: true })
      .catch(() => ({ items: [], nextCursor: null })),
    iam.listRoles({ limit: 200 }).catch(() => ({ items: [] })),
    fetchAll((cursor) => leagueMgmt
      .listSeasons({ orgId: id, limit: 100, cursor }))
      .catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt
      .listTeams({ orgId: id, limit: 100, cursor }))
      .catch(() => ({ items: [], nextCursor: null })),
    registration
      .listRegistrations({ orgId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => orgs.list({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
    // This environment's player app, as configured on the API (REG-12).
    publicRegistration.appLinks().catch(() => null)
  ]);

  const orgMap = new Map(allOrgsPage.items.map((o) => [o.id, o.displayName]));
  // Post-flip — leagues belong directly to an org.
  const orgLeagues = leaguesPage.items.filter((l) => l.orgId === id);
  const leagueMap = new Map(orgLeagues.map((l) => [l.id, l.name]));

  // One paged divisions list kept to this org's seasons, for the
  // cross-season roll-up; not one call per season (CONSOLE-22).
  const seasonById = new Map(seasonsPage.items.map((s) => [s.id, s]));
  const allDivisions = (
    await fetchAll((cursor) => leagueMgmt.listDivisions({ limit: 100, cursor })).catch(() => ({
      items: [],
      nextCursor: null
    }))
  ).items
    .filter((d) => seasonById.has(d.seasonId))
    .map((d) => ({
      ...d,
      seasonName: seasonById.get(d.seasonId)!.name,
      leagueName: leagueMap.get(seasonById.get(d.seasonId)!.leagueId) ?? null
    }));

  return (
    <div className="space-y-10">
      <Link
        href="/organizations"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All organizations
      </Link>

      {/* Header */}
      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={Building2} tint="violet" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>ORG · {org.legalName}</Eyebrow>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {org.displayName}
          </h1>
          <p className="font-mono text-[13px] text-fg-muted">{org.slug}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge mono>{org.orgType.replace(/_/g, " ")}</Badge>
            <Badge tone={statusTone(org.status)} mono>
              {org.status}
            </Badge>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              <Globe2 className="h-3 w-3" strokeWidth={1.75} />
              {org.countryCode} · {org.defaultCurrency}
            </span>
          </div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-3">
          <OrgActions org={org} />
        <div className="grid grid-cols-3 gap-3 text-right">
          <Stat label="Seasons" value={seasonsPage.items.length} />
          <Stat label="Leagues" value={orgLeagues.length} />
          <Stat label="Teams" value={teamsPage.items.length} />
        </div>
        </div>
      </header>

      {appLinks?.playerWebUrl ? (
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <CopyLink label="Public registration page" value={`${appLinks.playerWebUrl}/join?org=${org.slug}`} />
        </div>
      ) : null}

      {/* Org-scoped role assignments */}
      <Section
        eyebrow="Admins"
        title="Org admins + memberships"
        description="Users with active roles scoped to this org. Every org should have at least one org_admin — assign one below or invite by email."
        icon={Users}
        tint="emerald"
      >
        <RoleAssignmentPanel
          scopeType="org"
          scopeId={org.id}
          allowedRoleCodes={["org_admin", "registrar"]}
          resourceLabel={org.displayName}
          initialAssignments={assignments.items}
        />
      </Section>

      {/* Regions: Season -> Region -> Division (PPHL item 8) */}
      <RegionsSection orgId={org.id} orgName={org.displayName} />

      {/* Org relations (hierarchy) */}
      <Section
        eyebrow="Hierarchy"
        title="Parent / child orgs"
        description="Federations sanction leagues; clubs are owned by their parent org. Relations cascade authorization in resource-scope guards."
        icon={Network}
        tint="amber"
        action={<LinkOrgButton orgId={org.id} allOrgs={allOrgsPage.items} />}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Subgroup title="Parents" empty="No parent orgs." count={parents.length}>
            <ul className="divide-y divide-border">
              {parents.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      <Link
                        href={`/organizations/${r.parentOrgId}`}
                        className="hover:underline"
                      >
                        {orgMap.get(r.parentOrgId) ?? "Unknown org"}
                      </Link>
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                      {r.relation} · {fmtDate(r.effectiveFrom)}
                    </p>
                  </div>
                  <UnlinkRelationButton id={r.id} />
                </li>
              ))}
            </ul>
          </Subgroup>
          <Subgroup
            title="Children"
            empty="No child orgs."
            count={children.length}
          >
            <ul className="divide-y divide-border">
              {children.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      <Link
                        href={`/organizations/${r.childOrgId}`}
                        className="hover:underline"
                      >
                        {orgMap.get(r.childOrgId) ?? "Unknown org"}
                      </Link>
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                      {r.relation} · {fmtDate(r.effectiveFrom)}
                    </p>
                  </div>
                  <UnlinkRelationButton id={r.id} />
                </li>
              ))}
            </ul>
          </Subgroup>
        </div>
      </Section>

      {/* Cross-org grants */}
      <Section
        eyebrow="Cross-org"
        title="Cross-org grants"
        description="Explicit cross-tenant access. A user with a grant from this org can act inside the target org with the listed permissions."
        icon={KeyRound}
        tint="rose"
        action={<IssueGrantButton fromOrgId={org.id} allOrgs={allOrgsPage.items} />}
      >
        {grants.length === 0 ? (
          <Empty message="No cross-org grants issued from this org." />
        ) : (
          <ul className="divide-y divide-border">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    <Link
                      href={`/users/${g.userId}`}
                      className="hover:underline"
                    >
                      {g.userDisplayName ?? "Unknown user"}
                    </Link>
                    <span className="ml-2 text-fg-muted">→</span>{" "}
                    <Link
                      href={`/organizations/${g.toOrgId}`}
                      className="hover:underline"
                    >
                      {orgMap.get(g.toOrgId) ?? "Unknown org"}
                    </Link>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {g.permissions.length === 0
                      ? "all permissions"
                      : `${g.permissions.length} permission(s): ${g.permissions.join(", ")}`}{" "}
                    · since {fmtDate(g.effectiveFrom)}
                  </p>
                </div>
                <RevokeGrantButton id={g.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Leagues */}
      <Section
        eyebrow="Leagues"
        title={`Leagues (${orgLeagues.length})`}
        description="Every league owned by this org. Each league owns its seasons + division structure."
        icon={Network}
        tint="blue"
      >
        {orgLeagues.length === 0 ? (
          <Empty message="No leagues yet for this org." />
        ) : (
          <ul className="divide-y divide-border">
            {orgLeagues.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    <Link
                      href={`/leagues/${l.id}`}
                      className="hover:underline"
                    >
                      {l.name}
                    </Link>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {l.sportCode} · {l.format ?? "—"}
                  </p>
                </div>
                <Badge tone={statusTone(l.status)} mono>
                  {l.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Seasons */}
      <Section
        eyebrow="Seasons"
        title={`Seasons (${seasonsPage.items.length})`}
        description="All seasons under this org's leagues, newest first."
        icon={CalendarRange}
        tint="cyan"
      >
        {seasonsPage.items.length === 0 ? (
          <Empty message="No seasons scheduled yet." />
        ) : (
          <ul className="divide-y divide-border">
            {seasonsPage.items.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    <Link
                      href={`/seasons/${s.id}`}
                      className="hover:underline"
                    >
                      {s.name}
                    </Link>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {leagueMap.get(s.leagueId) ?? "Unknown league"} ·{" "}
                    {fmtDate(s.startDate)} → {fmtDate(s.endDate)}
                  </p>
                </div>
                <Badge tone={statusTone(s.status)} mono>
                  {s.status.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Divisions */}
      <Section
        eyebrow="Divisions"
        title={`Divisions (${allDivisions.length})`}
        description="Tiered/age-stratified competition slots across every season."
        icon={Layers}
        tint="violet"
      >
        {allDivisions.length === 0 ? (
          <Empty message="No divisions yet across this org's seasons." />
        ) : (
          <ul className="divide-y divide-border">
            {allDivisions.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    <Link
                      href={`/divisions/${d.id}`}
                      className="hover:underline"
                    >
                      {d.name}
                    </Link>
                    {d.tier && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                        {d.tier}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {d.seasonName}
                    {d.leagueName && ` · ${d.leagueName}`}
                    {" · "}
                    {d.genderEligibility}
                    {d.maxTeams && ` · max ${d.maxTeams} teams`}
                  </p>
                </div>
                <Badge tone={statusTone(d.status)} mono>
                  {d.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Teams */}
      <Section
        eyebrow="Teams"
        title={`Teams (${teamsPage.items.length})`}
        description="Teams owned by this org. They enter divisions via DivisionTeamEntry."
        icon={Trophy}
        tint="emerald"
      >
        {teamsPage.items.length === 0 ? (
          <Empty message="No teams yet for this org." />
        ) : (
          <ul className="divide-y divide-border">
            {teamsPage.items.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    <Link
                      href={`/teams/${t.id}`}
                      className="hover:underline"
                    >
                      {t.name}
                    </Link>
                    {t.shortName && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                        {t.shortName}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {t.sportCode}
                    {t.captainUserId && (
                      <>
                        {" · captain "}
                        <Link
                          href={`/users/${t.captainUserId}`}
                          className="hover:text-fg"
                        >
                          {t.captainName ?? "Unknown user"}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <Badge tone={statusTone(t.status)} mono>
                  {t.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Registrations counter (still useful, but no longer the only roll-up) */}
      <section className="grid gap-4 md:grid-cols-1">
        <CounterCard
          label="Active registrations"
          value={
            registrationsPage.items.filter(
              (r) =>
                r.status === "submitted" ||
                r.status === "under_review" ||
                r.status === "approved"
            ).length
          }
          total={registrationsPage.items.length}
          href={`/registrations?orgId=${org.id}`}
        />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[100px] rounded-lg border border-border bg-surface-1 px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p className="mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight text-fg">
        {value}
      </p>
    </div>
  );
}

function Section({
  icon,
  tint,
  eyebrow,
  title,
  description,
  action,
  children
}: {
  icon: LucideIcon;
  tint: "violet" | "emerald" | "amber" | "blue" | "rose" | "cyan";
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-start gap-3 border-b border-border px-6 py-4">
        <IconTile icon={Icon} tint={tint} size="sm" />
        <div className="flex-1">
          <Eyebrow>{eyebrow}</Eyebrow>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">
            {title}
          </p>
          {description ? (
            <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function Subgroup({
  title,
  count,
  empty,
  children
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {title} ({count})
      </p>
      {count === 0 ? <Empty message={empty} /> : children}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <p className="py-6 text-center text-sm text-fg-muted">{message}</p>
  );
}

function CounterCard({
  label,
  value,
  total,
  href
}: {
  label: string;
  value: number;
  total?: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-border bg-surface-1 p-5 transition-colors duration-fast ease-ease hover:border-border-strong"
    >
      <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p className="mt-3 font-mono text-[28px] font-semibold tabular-nums tracking-tight text-fg">
        {value}
        {total !== undefined ? (
          <span className="text-[14px] text-fg-muted"> / {total}</span>
        ) : null}
      </p>
    </Link>
  );
}
