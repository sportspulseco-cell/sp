import { fetchAll } from "@sportspulse/api-client";
import { Badge, Alert, LocalDate, EmptyState, PageHeader, TBody, TD, TH, THead, TR, Table, statusTone } from "@sportspulse/ui";
import { Users, Mail, ShieldCheck, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { iam } from "@/lib/api/server-api";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { InviteUserButton } from "@/components/users/invite-user-button";
import { viewerRoleGrants } from "@/lib/role-grants";
import { ManageUserRolesCell } from "@/components/users/manage-user-roles-cell";
import { UserTypeCell } from "@/components/users/user-type-cell";
import { UserActionsMenu } from "@/components/users/user-actions-menu";
import { UsersFilters } from "@/components/users/users-filters";
import { resolvePrimaryRole } from "@/components/users/primary-role";
import type { RoleAssignment } from "@/lib/api/types";

export const metadata = { title: "Users · Super Admin" };

export default async function UsersPage({
  searchParams
}: {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    type?: string;
    region?: string;
    country?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  // Every account, not the first 50: newly invited users were missing
  // and the KPI tiles undercounted (68 users on staging).
  let loadFailed = false;
  const viewer = await viewerRoleGrants();
  const [page, assignments] = await Promise.all([
    fetchAll((cursor) => iam.listUsers({ limit: 100, cursor })).catch((e) => {
      // Show the failure; an empty list here read as "No users yet".
      console.error("[users] listUsers failed", e);
      loadFailed = true;
      return { items: [], nextCursor: null };
    }),
    fetchAll((cursor) =>
      iam.listRoleAssignments({ activeOnly: true, limit: 100, cursor })
    ).catch((e) => {
      console.error("[users] listRoleAssignments failed", e);
      loadFailed = true;
      return { items: [] as RoleAssignment[], nextCursor: null };
    })
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
  const regionOptions = [...new Set(page.items.flatMap((u) => u.regions ?? []))].sort();

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
    if (sp.region) {
      const rs = u.regions ?? [];
      if (sp.region === "none" ? rs.length > 0 : !rs.includes(sp.region)) return false;
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
        eyebrow="People"
        title="Users"
        description="Everyone with a login. Invite a user, set their role, or edit their profile."
        action={<InviteUserButton granter={{ isSuperAdmin: viewer.isSuperAdmin, holdings: viewer.holdings }} />}
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
        <UsersFilters types={typeOptions} regions={regionOptions} countries={countryOptions} />
        <p className="text-[12px] text-fg-muted">
          Showing {shown.length} of {total} users
        </p>
      </div>
      {loadFailed ? (
        <Alert tone="error">
          Could not load users. This is a server problem on our side, not your data. Reload to try again.
        </Alert>
      ) : page.items.length > 0 && shown.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users match these filters"
          description="Clear the search or pick a different status, type, region or country."
        />
      ) : page.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Users sign up via Supabase Auth. They appear here once a profile is created."
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
                    {[u.countryCode, ...(u.regions ?? [])].filter(Boolean).join(" · ") || "—"}
                  </TD>
                  <TD>
                    <Badge status={u.status} />
                  </TD>
                  <TD className="text-muted-foreground">
                    <UserTypeCell
                      userId={u.id}
                      isSuperAdmin={u.isSuperAdmin}
                      primary={typeOf(u)}
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
                    <LocalDate iso={u.createdAt} format="date" />
                  </TD>
                  <TD>
                    <UserActionsMenu user={u} userType={typeOf(u)?.code ?? null} />
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
