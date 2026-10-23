import { fetchAll } from "@sportspulse/api-client";
import { Users, Mail, ShieldCheck, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { InviteUserButton } from "@/components/users/invite-user-button";
import { ManageUserRolesCell } from "@/components/users/manage-user-roles-cell";
import { UserTypeCell } from "@/components/users/user-type-cell";
import { UserActionsMenu } from "@/components/users/user-actions-menu";
import { UsersFilters } from "@/components/users/users-filters";
import { resolvePrimaryRole } from "@/components/users/primary-role";
import type { RoleAssignment } from "@/lib/api/types";

export const metadata = { title: "Users — SportsPulse" };

export default async function UsersPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; status?: string; type?: string; country?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  // Every account, not the first 50: newly invited users were missing
  // and the KPI tiles undercounted (68 users on staging).
  const [page, assignments] = await Promise.all([
    fetchAll((cursor) => iam.listUsers({ limit: 100, cursor })).catch(
      () => ({ items: [], nextCursor: null })
    ),
    fetchAll((cursor) =>
      iam.listRoleAssignments({ activeOnly: true, limit: 100, cursor })
    ).catch(() => ({ items: [] as RoleAssignment[], nextCursor: null }))
  ]);

  // Type = the same primary role the Type column shows.
  const byUser = new Map<string, RoleAssignment[]>();
  for (const a of assignments.items) {
    const list = byUser.get(a.userId) ?? [];
    list.push(a);
    byUser.set(a.userId, list);
  }
  const typeOf = (u: { id: string; isSuperAdmin: boolean }) =>
    resolvePrimaryRole(u.isSuperAdmin, byUser.get(u.id) ?? []);
  const typeOptions = [
    ...new Map(
      page.items
        .map((u) => typeOf(u))
        .filter((t): t is { code: string; name: string } => t !== null)
        .map((t) => [t.code, t] as const)
    ).values()
  ].sort((a, b) => a.name.localeCompare(b.name));
  const countryOptions = [
    ...new Set(page.items.map((u) => u.countryCode).filter((c): c is string => !!c))
  ].sort();

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shown = page.items.filter((u) => {
    if (q) {
      const hay = `${u.displayName ?? ""} ${u.legalFirstName ?? ""} ${u.legalLastName ?? ""} ${u.email ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (sp.status && u.status !== sp.status) return false;
    if (sp.type) {
      const t = typeOf(u)?.code ?? "none";
      if (t !== sp.type) return false;
    }
    if (sp.country) {
      const c = u.countryCode ?? "none";
      if (c !== sp.country) return false;
    }
    return true;
  });

  const total = page.items.length;
  const active = page.items.filter((u) => u.status === "active").length;
  const suspended = page.items.filter((u) => u.status === "suspended").length;
  const superAdmins = page.items.filter((u) => u.isSuperAdmin).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="directory"
        title="Users"
        description="Authenticated user accounts across all tenants."
        action={<InviteUserButton />}
      />
      <KineticStrip
        cards={[
          { label: "Total users", value: total, icon: <Users className="h-3.5 w-3.5" strokeWidth={1.75} />, tone: "idle" },
          {
            label: "Active",
            value: active,
            tone: active > 0 ? "ok" : "idle",
            hint: total > 0 ? `${Math.round((active / total) * 100)}% of total` : undefined,
            icon: <UserCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          },
          {
            label: "Suspended",
            value: suspended,
            tone: suspended > 0 ? "warn" : "idle",
            icon: <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
          },
          {
            label: "Super admins",
            value: superAdmins,
            tone: "info",
            icon: <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
          }
        ]}
      />
      <div className="space-y-2">
        <UsersFilters types={typeOptions} countries={countryOptions} />
        <p className="text-[12px] text-fg-muted">
          Showing {shown.length} of {total} users
        </p>
      </div>
      {page.items.length > 0 && shown.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users match these filters"
          description="Clear the search or pick a different status, type or country."
        />
      ) : page.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Users sign up via Supabase Auth — they appear here once a profile is created."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Country / Region</TH>
              <TH>Status</TH>
              <TH>Type</TH>
              <TH>Roles</TH>
              <TH>Joined</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {shown.map((u) => {
              const name =
                u.displayName ||
                [u.legalFirstName, u.legalLastName].filter(Boolean).join(" ") ||
                "—";
              return (
                <TR key={u.id}>
                  <TD className="font-medium">
                    <Link
                      href={`/users/${u.id}`}
                      className="block hover:underline"
                    >
                      {name}
                    </Link>
                  </TD>
                  <TD className="text-muted-foreground">{u.email ?? "—"}</TD>
                  <TD className="text-muted-foreground">
                    {u.countryCode ?? "—"}
                  </TD>
                  <TD>
                    <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                  </TD>
                  <TD className="text-muted-foreground">
                    <UserTypeCell
                      userId={u.id}
                      isSuperAdmin={u.isSuperAdmin}
                    />
                  </TD>
                  <TD>
                    <ManageUserRolesCell
                      userId={u.id}
                      display={name}
                      isSuperAdmin={u.isSuperAdmin}
                    />
                  </TD>
                  <TD className="text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("en-CA")}
                  </TD>
                  <TD>
                    <UserActionsMenu user={u} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
