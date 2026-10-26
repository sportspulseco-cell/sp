import { ShieldCheck, Sparkles, Layers } from "lucide-react";
import { LoadError } from "@sportspulse/ui";
import Link from "next/link";
import { fetchAll, load } from "@sportspulse/api-client";
import { iam, orgs } from "@/lib/api/server-api";
import {
  Badge,
  EmptyState,
  Eyebrow,
  IconTile,
  PageHeader,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { CreateRoleButton } from "@/components/roles/create-role-button";
import { DeleteRoleButton } from "@/components/roles/delete-role-button";
import { PermissionBadges } from "@/components/permissions/permission-badges";
import { HIERARCHY, hierarchyOrder } from "@/components/roles/hierarchy";

export const metadata = { title: "Roles · Super Admin" };

export default async function RolesPage() {
  const [rolesResult, orgList] = await Promise.all([
    load(iam.listRoles({ limit: 200 })),
    fetchAll((cursor) => orgs.list({ limit: 100, cursor })).catch(() => ({ items: [] }))
  ]);
  if (!rolesResult.ok) {
    return <LoadError what="roles" status={rolesResult.status} message={rolesResult.message} />;
  }
  const page = rolesResult.data;
  const orgMap = new Map(orgList.items.map((o) => [o.id, o.displayName]));

  const sorted = [...page.items].sort((a, b) => {
    if (a.isSystem && !b.isSystem) return -1;
    if (!a.isSystem && b.isSystem) return 1;
    if (a.isSystem) return hierarchyOrder(a.code) - hierarchyOrder(b.code);
    return a.code.localeCompare(b.code);
  });

  const systemRoles = sorted.filter((r) => r.isSystem);
  const customRoles = sorted.filter((r) => !r.isSystem);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="People"
        title="Roles & permissions"
        description="What each role may do. League, season and division admins see only their part of the platform."
        action={<CreateRoleButton />}
      />
      <KineticStrip
        cards={[
          {
            label: "System roles",
            value: systemRoles.length,
            icon: <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "info"
          },
          {
            label: "Custom roles",
            value: customRoles.length,
            icon: <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: customRoles.length > 0 ? "ok" : "idle"
          },
          {
            label: "Total roles",
            value: page.items.length,
            icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />,
            tone: "idle"
          }
        ]}
      />

      {/* Hierarchy explainer */}
      <section className="rounded-xl border border-border bg-surface-1 p-5">
        <div className="flex items-start gap-4">
          <IconTile icon={ShieldCheck} tint="violet" size="md" />
          <div className="space-y-2">
            <Eyebrow>Hierarchy</Eyebrow>
            <p className="text-[13px] text-fg-muted">
              Each level inherits the capabilities of the levels below it,
              scoped to its own resource. A league_admin gets all captain /
              coach / referee abilities <em>within</em> their league.
            </p>
            <ol className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
              {HIERARCHY.map((code, i) => (
                <li key={code} className="flex items-center gap-1.5">
                  <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-fg">
                    {code}
                  </span>
                  {i < HIERARCHY.length - 1 ? (
                    <span aria-hidden>→</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* System roles */}
      <section className="space-y-3">
        <header>
          <Eyebrow>System roles</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Seeded with the platform. Read-only: names + permissions are
            managed via migrations.
          </p>
        </header>
        {systemRoles.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No system roles loaded"
            description="Run pnpm seed in packages/db to load the default catalog."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-12 text-center">#</TH>
                <TH>Role</TH>
                <TH>Description</TH>
                <TH>Permissions</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {systemRoles.map((r) => (
                <TR key={r.id}>
                  <TD className="text-center font-mono text-[10px] tabular-nums text-fg-muted">
                    {hierarchyOrder(r.code) + 1}
                  </TD>
                  <TD>
                    <Link href={`/roles/${r.id}`} className="block hover:underline">
                      <p className="font-mono text-[12px] font-medium text-fg">
                        {r.code}
                      </p>
                      <p className="mt-0.5 text-[12px] text-fg-muted">
                        {r.name}
                      </p>
                    </Link>
                  </TD>
                  <TD className="text-fg-muted">
                    {r.description ?? <span className="text-fg-muted">—</span>}
                  </TD>
                  <TD>
                    <PermissionBadges permissions={r.permissions} />
                  </TD>
                  <TD>
                    <Badge tone="info" mono>
                      SYSTEM
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {/* Custom roles */}
      <section className="space-y-3">
        <header>
          <Eyebrow>Custom roles</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Org-scoped, fully editable. {customRoles.length}{" "}
            {customRoles.length === 1 ? "role" : "roles"}.
          </p>
        </header>
        {customRoles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 p-12 text-center">
            <ShieldCheck
              className="mx-auto h-5 w-5 text-fg-muted"
              strokeWidth={1.5}
            />
            <p className="mt-3 text-sm font-semibold text-fg">
              No custom roles yet
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              Create a role to grant org-specific capability sets that don't
              fit the default hierarchy.
            </p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Org</TH>
                <TH>Permissions</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {customRoles.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-[12px] font-medium text-fg">
                    <Link href={`/roles/${r.id}`} className="hover:underline">
                      {r.code}
                    </Link>
                  </TD>
                  <TD className="text-fg">{r.name}</TD>
                  <TD className="text-[12px] text-fg-muted">
                    {r.orgId ? (orgMap.get(r.orgId) ?? "Unknown org") : "—"}
                  </TD>
                  <TD>
                    <PermissionBadges permissions={r.permissions} />
                  </TD>
                  <TD className="text-right">
                    <DeleteRoleButton id={r.id} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
