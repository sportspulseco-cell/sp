import { ShieldCheck, Sparkles, Layers } from "lucide-react";
import Link from "next/link";
import { iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { CreateRoleButton } from "@/components/roles/create-role-button";
import { DeleteRoleButton } from "@/components/roles/delete-role-button";
import { PermissionBadges } from "@/components/permissions/permission-badges";

export const metadata = { title: "Roles — SportsPulse" };

const HIERARCHY = [
  "super_admin",
  "org_admin",
  "league_admin",
  "season_admin",
  "division_admin",
  "team_admin",
  "coach",
  "registrar",
  "referee",
  "scorekeeper",
  "player",
  "parent",
  "spectator"
];

function hierarchyOrder(code: string): number {
  const i = HIERARCHY.indexOf(code);
  return i === -1 ? HIERARCHY.length : i;
}

export default async function RolesPage() {
  const page = await iam
    .listRoles({ limit: 200 })
    .catch(() => ({ items: [], nextCursor: null }));

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
        eyebrow="iam"
        title="Roles"
        description="System roles cascade top-down — super_admin inherits everything below it. Custom roles attach to a single org and live alongside the system catalog."
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
              scoped to its own resource. A league_admin gets all team_admin /
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
            Seeded with the platform. Read-only — names + permissions are
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
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {r.orgId?.slice(0, 8) ?? "—"}
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
