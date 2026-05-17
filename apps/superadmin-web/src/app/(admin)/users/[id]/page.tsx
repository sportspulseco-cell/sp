import { ArrowLeft, Building2, ShieldCheck, Trophy, UserCog } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { iam } from "@/lib/api/server-api";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge, statusTone } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { tintForScope } from "@/components/roles/role-scope-tint";
import { AssignRolePanel } from "@/components/roles/assign-role-panel";
import { RevokeAssignmentButton } from "@/components/roles/revoke-assignment-button";
import { EditUserButton } from "@/components/users/edit-user-button";
import { SuspendUserButton } from "@/components/users/suspend-user-button";
import { resolvePrimaryRole } from "@/components/users/primary-role";

export const metadata = { title: "User — SportsPulse" };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default async function UserDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, assignments, roles, memberships] = await Promise.all([
    iam.getUser(id).catch(() => null),
    iam.activeRolesForUser(id).catch(() => []),
    iam.listRoles({ limit: 200 }).catch(() => ({ items: [] })),
    iam.userMemberships(id).catch(() => ({ items: [] }))
  ]);
  if (!user) notFound();

  const display =
    user.displayName ||
    [user.legalFirstName, user.legalLastName].filter(Boolean).join(" ") ||
    user.email ||
    "—";

  return (
    <div className="space-y-10">
      <Link
        href="/users"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All users
      </Link>

      {/* Header */}
      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={UserCog} tint="emerald" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>USER · {user.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {display}
          </h1>
          <p className="text-[13px] text-fg-muted">{user.email ?? "—"}</p>
          <div className="flex items-center gap-2 pt-1">
            <Badge tone={statusTone(user.status)} mono>
              {user.status}
            </Badge>
            {user.isSuperAdmin ? (
              <Badge tone="primary" mono>
                SUPER ADMIN
              </Badge>
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              joined {fmtDate(user.createdAt)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <EditUserButton user={user} />
            <SuspendUserButton
              userId={user.id}
              suspended={user.status === "suspended"}
            />
          </div>
        </div>
      </header>

      {/* Active role assignments */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Active role assignments</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              {assignments.length} active{" "}
              {assignments.length === 1 ? "assignment" : "assignments"} ·
              cascading top-down per the hierarchy
            </p>
          </div>
        </header>
        {assignments.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-fg-muted">
            {user.isSuperAdmin
              ? "Super admin has implicit access to everything — no scoped roles needed."
              : "No active assignments. Use the panel below to grant a role."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-4 px-6 py-3.5"
              >
                <IconTile
                  icon={ShieldCheck}
                  tint={tintForScope(a.scopeType)}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    {a.role?.name ?? a.roleId.slice(0, 8)}
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                      {a.role?.code}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    scope: {a.scopeType}
                    {a.scopeId ? ` · ${a.scopeId.slice(0, 8)}` : ""} · since{" "}
                    {fmtDate(a.effectiveFrom)}
                  </p>
                </div>
                <RevokeAssignmentButton id={a.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Team memberships */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Team memberships</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              {memberships.items.length} team{memberships.items.length === 1 ? "" : "s"} this user is rostered on, with division + season context.
            </p>
          </div>
        </header>
        {memberships.items.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-fg-muted">
            Not on any team rosters. Once a captain adds them via the
            registration funnel or the roster manager, the team + division
            will appear here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {memberships.items.map((m) => (
              <li key={m.membershipId} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
                <IconTile icon={Trophy} tint="emerald" size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    <Link
                      href={`/teams/${m.teamId}`}
                      className="hover:underline"
                    >
                      {m.teamName}
                    </Link>
                    {m.teamShortName && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                        {m.teamShortName}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    <Link
                      href={`/organizations/${m.orgId}`}
                      className="inline-flex items-center gap-1 hover:text-fg"
                    >
                      <Building2 className="h-3 w-3" strokeWidth={1.75} />
                      {m.orgName}
                    </Link>
                    <span aria-hidden>·</span>
                    <span>{m.seasonName}</span>
                    {m.divisionName && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-fg">{m.divisionName}</span>
                      </>
                    )}
                    {m.jerseyNumber != null && (
                      <>
                        <span aria-hidden>·</span>
                        <span>#{m.jerseyNumber}</span>
                      </>
                    )}
                    {m.positionCode && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{m.positionCode}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {m.membershipType !== "primary" && (
                    <Badge tone="neutral" mono>
                      {m.membershipType}
                    </Badge>
                  )}
                  <Badge tone={statusTone(m.currentStatus)} mono>
                    {m.currentStatus}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Assign role panel */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="border-b border-border px-6 py-4">
          <Eyebrow>Assign new role</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Pick a role + scope. Assigning the same (role, scope) twice is a
            no-op — the existing active assignment is returned.
          </p>
        </header>
        <div className="p-6">
          {/* defaultRoleCode reflects the user's current primary role so
              the dropdown lands on a relevant default — captain
              (alphabetic-first) was a CLAUDE.md cardinal-rule
              violation on super_admin and org_admin rows. */}
          <AssignRolePanel
            userId={user.id}
            roles={roles.items}
            defaultRoleCode={
              resolvePrimaryRole(user.isSuperAdmin ?? false, assignments)?.code
            }
          />
        </div>
      </section>
    </div>
  );
}
