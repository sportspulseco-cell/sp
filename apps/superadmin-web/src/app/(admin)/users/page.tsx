import { Users } from "lucide-react";
import Link from "next/link";
import { iam } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
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

export const metadata = { title: "Users — SportsPulse" };

export default async function UsersPage() {
  const page = await iam
    .listUsers({ limit: 50 })
    .catch(() => ({ items: [], nextCursor: null }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Authenticated user accounts across all tenants."
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
              <TH>Role</TH>
              <TH>Joined</TH>
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
                    {u.isSuperAdmin ? (
                      <Badge tone="primary">Super admin</Badge>
                    ) : (
                      "User"
                    )}
                  </TD>
                  <TD className="text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
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
