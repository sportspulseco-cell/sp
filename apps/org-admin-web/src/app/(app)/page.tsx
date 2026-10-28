import { formatMoney, SUBMISSION_STATUS_FILTERS } from "@sportspulse/kernel";
import { fetchAll } from "@sportspulse/api-client";
import { Building2, ClipboardList, Wallet } from "lucide-react";
import { EmptyState, PageHeader, TodoList, type TodoItem } from "@sportspulse/ui";
import { adminTransfers, gameOps, leagueMgmt, loadMeScope, orgAdminFinance, orgs, registration, registrationV2Admin, roster } from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";
import { SeasonFlow } from "@sportspulse/admin-pages";
/* Hallmark · page: dashboard · genre: editorial · theme: project (sp-org-admin)
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */

export const dynamic = "force-dynamic";

export default async function OrgAdminHome() {
  const scope = await loadMeScope();
  const myOrgId = await getActiveOrgId(scope);
  const myOrg = myOrgId ? await orgs.get(myOrgId).catch(() => null) : null;

  if (!scope || !myOrgId) {
    return (
      <ShellWithoutOrg
        message={
          scope
            ? "Your account isn't scoped to an organization yet. An admin needs to assign you the org_admin role."
            : "We couldn't load your account. Try signing out and back in."
        }
      />
    );
  }

  const [leaguesPage, seasonsPage, registrationsPage, invoicesPage] =
    await Promise.all([
      fetchAll((cursor) => leagueMgmt
        .listLeagues({ orgId: myOrgId, limit: 100, cursor }))
        .catch(() => ({ items: [], nextCursor: null })),
      fetchAll((cursor) => leagueMgmt
        .listSeasons({ orgId: myOrgId, limit: 100, cursor }))
        .catch(() => ({ items: [], nextCursor: null })),
      // Org-scoped review queue; listRegistrations is super_admin only.
      registrationV2Admin
        .listSubmissions({ orgId: myOrgId, limit: 200 })
        .catch(() => ({ items: [] })),
      orgAdminFinance
        .listInvoices({ orgId: myOrgId })
        .catch(() => ({ items: [], nextCursor: null }))
    ]);

  // The same "to review" as the review queue's filter (kernel).
  const toReview = new Set<string>(SUBMISSION_STATUS_FILTERS.find((f) => f.value === "pending_review")?.statuses ?? []);
  const pendingRegs = registrationsPage.items.filter((r) => toReview.has(r.status as string));

  const currency = invoicesPage.items[0]?.currency ?? "USD";
  const outstandingCents = invoicesPage.items
    .filter((i) => i.status !== "void")
    .reduce((sum, i) => sum + Math.max(0, i.totalCents - i.paidCents), 0);
  const overdueCount = invoicesPage.items.filter(
    (i) => i.status === "overdue"
  ).length;

  const todo: TodoItem[] = [];
  if (pendingRegs.length > 0)
    todo.push({
      icon: ClipboardList,
      label: `${pendingRegs.length} ${pendingRegs.length === 1 ? "registration" : "registrations"} to review`,
      action: "Review",
      href: "/registrations"
    });
  if (overdueCount > 0)
    todo.push({
      icon: Wallet,
      tone: "warn",
      label: `${overdueCount} overdue ${overdueCount === 1 ? "invoice" : "invoices"} · ${formatMoney(outstandingCents, currency)} owed`,
      action: "Follow up",
      href: "/finance"
    });

  return (
    <div className="space-y-10">
      <PageHeader title={myOrg?.displayName ?? "Your organization"} />

      <TodoList items={todo} />

      {/* Season lifecycle with one next step each (shared with the admin console). */}
      <SeasonFlow
        api={{ leagueMgmt, adminTransfers, gameOps, registration, roster }}
        seasons={seasonsPage.items}
        leagues={leaguesPage.items}
        orgId={myOrgId}
        links={{ rosters: "/teams", results: "/scheduling" }}
      />
    </div>
  );
}

function ShellWithoutOrg({ message }: { message: string }) {
  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Organization" title="Org Admin" />
      <EmptyState
        icon={Building2}
        title="No organization yet"
        description={message}
      />
      <p className="text-[13px] text-fg-muted">
        Ask your platform admin to make you an admin of your organization.
      </p>
    </section>
  );
}
