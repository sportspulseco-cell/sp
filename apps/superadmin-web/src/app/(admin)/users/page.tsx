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

export const metadata = { title: "Users — SportsPulse" };

export default async function UsersPage() {
  const page = await iam
    .listUsers({ limit: 50 })
    .catch(() => ({ items: [], nextCursor: null }));

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
      {page.items.length === 0 ? (
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
              <TH>Country</TH>
              <TH>Status</TH>
              <TH>Type</TH>
              <TH>Roles</TH>
              <TH>Joined</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((u) => {
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
                    <ManageUserRolesCell userId={u.id} display={name} />
                  </TD>
                  <TD className="text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
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
