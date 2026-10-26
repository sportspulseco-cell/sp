import { ArrowLeft, Building2, Layers, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchAll, load, type RoleAssignment } from "@sportspulse/api-client";
import {
  Badge,
  EmptyState,
  Eyebrow,
  IconTile,
  LoadError,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  statusTone
} from "@sportspulse/ui";
import { countEffectivePermissions } from "@sportspulse/kernel";
import { iam, orgs } from "@/lib/api/server-api";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { PermissionBadges } from "@/components/permissions/permission-badges";
import { HIERARCHY, hierarchyOrder } from "@/components/roles/hierarchy";

export const metadata = { title: "Role — SportsPulse" };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function BackLink() {
  return (
    <Link
      href="/roles"
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
    >
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
      All roles
    </Link>
  );
}

/** One key per (scopeType, scopeId) so "distinct scopes" counts places, not rows. */
function scopeKey(a: RoleAssignment): string {
  return `${a.scopeType}:${a.scopeId ?? ""}`;
}

export default async function RoleDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Role and holders load in parallel. `load()` keeps the HTTP status so
  // a missing role is a 404 while an API outage renders <LoadError>.
  const [roleRes, holdersRes] = await Promise.all([
    load(iam.getRole(id)),
    load(
      fetchAll((cursor) =>
        iam.listRoleAssignments({
          roleId: id,
          activeOnly: true,
          limit: 100,
          cursor
        })
      )
    )
  ]);

  if (!roleRes.ok) {
    if (roleRes.status === 404) notFound();
    return (
      <div className="space-y-6">
        <BackLink />
        <LoadError
          what="this role"
          status={roleRes.status}
          message={roleRes.message}
        />
      </div>
    );
  }
  const role = roleRes.data;

  // Custom roles attach to one org. The name is a label, so a failed
  // lookup degrades to a placeholder rather than failing the page.
  let orgName: string | null = null;
  if (role.orgId) {
    const orgRes = await load(orgs.get(role.orgId));
    orgName = orgRes.ok ? orgRes.data.displayName : "Unknown org";
  }

  const level = role.isSystem ? hierarchyOrder(role.code) : HIERARCHY.length;
  const inHierarchy = level < HIERARCHY.length;
  const permissionCount = countEffectivePermissions(role.permissions);

  const holders = holdersRes.ok ? holdersRes.data.items : [];
  const distinctScopes = new Set(holders.map(scopeKey)).size;

  return (
    <div className="space-y-10">
      <BackLink />

      {/* Header */}
      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile
          icon={ShieldCheck}
          tint={role.isSystem ? "violet" : "amber"}
          size="lg"
        />
        <div className="min-w-0 space-y-2">
          <Eyebrow dot>ROLE</Eyebrow>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {role.name}
          </h1>
          <p className="font-mono text-[13px] text-fg-muted">{role.code}</p>
          {role.description ? (
            <p className="max-w-2xl text-[13px] text-fg-muted">
              {role.description}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {role.isSystem ? (
              <Badge tone="info" mono>
                SYSTEM
              </Badge>
            ) : (
              <Badge tone="accent" mono>
                CUSTOM
              </Badge>
            )}
            {inHierarchy ? (
              <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                hierarchy {level + 1} / {HIERARCHY.length}
              </span>
            ) : null}
            {orgName ? (
              <Link
                href={`/organizations/${role.orgId}`}
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted hover:text-fg"
              >
                <Building2 className="h-3 w-3" strokeWidth={1.75} />
                {orgName}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* Permissions */}
      <section className="space-y-3">
        <header>
          <Eyebrow>Permissions</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            {permissionCount}{" "}
            {permissionCount === 1 ? "permission" : "permissions"}
            {role.isSystem
              ? " · managed via migrations, read-only here"
              : " · editable from the roles list"}
          </p>
        </header>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <PermissionBadges permissions={role.permissions} max={16} />
        </div>
      </section>

      {/* Who holds this role */}
      <section className="space-y-3">
        <header>
          <Eyebrow>Who holds this role</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Active assignments only. Revoked and expired grants are not
            listed.
          </p>
        </header>

        {!holdersRes.ok ? (
          <LoadError
            what="the holders of this role"
            status={holdersRes.status}
            message={holdersRes.message}
          />
        ) : (
          <>
            <KineticStrip
              cards={[
                {
                  label: "Holders",
                  value: holders.length,
                  icon: <Users className="h-3.5 w-3.5" strokeWidth={1.75} />,
                  tone: holders.length > 0 ? "ok" : "idle"
                },
                {
                  label: "Distinct scopes",
                  value: distinctScopes,
                  icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />,
                  tone: "idle"
                }
              ]}
            />

            {holders.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nobody holds this role yet"
                description="Grant it from a user's page: open the user, then use Assign new role."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>User</TH>
                    <TH>Scope</TH>
                    <TH>Granted</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {holders.map((a) => {
                    const name = a.userDisplayName?.trim() || null;
                    return (
                      <TR key={a.id}>
                        <TD>
                          <Link
                            href={`/users/${a.userId}`}
                            className="hover:underline"
                            title={a.userId}
                          >
                            {name ? (
                              <span className="text-sm font-medium text-fg">
                                {name}
                              </span>
                            ) : (
                              <span className="font-mono text-[12px] text-fg-muted">
                                {a.userId.slice(0, 8)}…
                              </span>
                            )}
                          </Link>
                        </TD>
                        <TD>
                          <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                            {a.scopeType}
                          </span>
                          {a.scopeId ? (
                            <span className="ml-2 text-[12px] text-fg">
                              {a.scopeName ?? `Unnamed ${a.scopeType}`}
                            </span>
                          ) : null}
                        </TD>
                        <TD className="text-[12px] text-fg-muted">
                          {fmtDate(a.effectiveFrom)}
                        </TD>
                        <TD className="text-right">
                          <Badge tone={statusTone("active")} mono>
                            active
                          </Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </>
        )}
      </section>
    </div>
  );
}
