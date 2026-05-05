import {
  ArrowLeft,
  Building2,
  Globe2,
  KeyRound,
  Network,
  Users,
  type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  crossOrgGrants,
  iam,
  leagueMgmt,
  orgs,
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

export const metadata = { title: "Organization — SportsPulse" };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
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

  const org = await orgs.get(id).catch(() => null);
  if (!org) notFound();

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
    allOrgsPage
  ] = await Promise.all([
    orgs.listChildren(id).catch(() => []),
    orgs.listParents(id).catch(() => []),
    crossOrgGrants.list({ orgId: id }).catch(() => []),
    iam
      .listRoleAssignments({ scopeType: "org", scopeId: id, activeOnly: true })
      .catch(() => ({ items: [], nextCursor: null })),
    iam.listRoles({ limit: 200 }).catch(() => ({ items: [] })),
    leagueMgmt
      .listSeasons({ orgId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listLeagues().catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt
      .listTeams({ orgId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    registration
      .listRegistrations({ orgId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    orgs.list({ limit: 200 }).catch(() => ({ items: [], nextCursor: null }))
  ]);

  const orgMap = new Map(allOrgsPage.items.map((o) => [o.id, o.displayName]));
  // Filter leagues for this org by joining via seasons.
  const orgSeasonIds = new Set(seasonsPage.items.map((s) => s.id));
  const orgLeagues = leaguesPage.items.filter((l) => orgSeasonIds.has(l.seasonId));

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
          <Eyebrow dot>ORG · {org.id.slice(0, 8)}</Eyebrow>
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
        <div className="ml-auto grid grid-cols-3 gap-3 text-right">
          <Stat label="Seasons" value={seasonsPage.items.length} />
          <Stat label="Leagues" value={orgLeagues.length} />
          <Stat label="Teams" value={teamsPage.items.length} />
        </div>
      </header>

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
                        {orgMap.get(r.parentOrgId) ??
                          r.parentOrgId.slice(0, 8)}
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
                        {orgMap.get(r.childOrgId) ??
                          r.childOrgId.slice(0, 8)}
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
                      className="hover:underline font-mono text-[12px]"
                    >
                      {g.userId.slice(0, 8)}
                    </Link>
                    <span className="ml-2 text-fg-muted">→</span>{" "}
                    <Link
                      href={`/organizations/${g.toOrgId}`}
                      className="hover:underline"
                    >
                      {orgMap.get(g.toOrgId) ?? g.toOrgId.slice(0, 8)}
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

      {/* Activity counters */}
      <section className="grid gap-4 md:grid-cols-3">
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
        <CounterCard
          label="Seasons"
          value={seasonsPage.items.length}
          href={`/seasons`}
        />
        <CounterCard
          label="Teams"
          value={teamsPage.items.length}
          href={`/teams`}
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
