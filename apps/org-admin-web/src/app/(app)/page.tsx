import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CalendarRange,
  CircleDollarSign,
  ClipboardList,
  Layers,
  ScrollText,
  Trophy,
  Wallet,
  type LucideIcon
} from "lucide-react";
import {
  Badge,
  Eyebrow,
  EmptyState,
  IconTile,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import {
  finance,
  iam,
  leagueMgmt,
  orgs,
  registration
} from "@/lib/api/server-api";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

export default async function OrgAdminHome() {
  // 1) figure out which org the signed-in user is currently looking
  // at — cookie-backed switcher with `scope.orgIds[0]` fallback.
  const scope = await iam.meScope().catch(() => null);
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

  // 2) parallel-fetch the data we want to render
  const [leaguesPage, seasonsPage, registrationsPage, invoicesPage] =
    await Promise.all([
      leagueMgmt
        .listLeagues({ orgId: myOrgId })
        .catch(() => ({ items: [], nextCursor: null })),
      leagueMgmt
        .listSeasons({ orgId: myOrgId })
        .catch(() => ({ items: [], nextCursor: null })),
      registration
        .listRegistrations({ orgId: myOrgId })
        .catch(() => ({ items: [], nextCursor: null })),
      finance
        .listInvoices({ orgId: myOrgId, limit: 200 })
        .catch(() => ({ items: [], nextCursor: null }))
    ]);

  // 3) derive KPIs — `status` types here come from the SDK's static
  // unions, which lag behind the v2 state machine the API ships
  // (registrations gained `pending_*` states in migration 0014, and
  // some season statuses not yet narrowed). Cast to string so the
  // filters match real runtime values without the SDK churn.
  const activeLeagues = leaguesPage.items.filter(
    (l) => (l.status as string) === "active"
  );
  const openSeasons = seasonsPage.items.filter((s) => {
    const v = s.status as string;
    return v === "registration_open" || v === "in_progress" || v === "active";
  });
  const pendingRegs = registrationsPage.items.filter((r) => {
    const v = r.status as string;
    return (
      v === "submitted" ||
      v === "under_review" ||
      v.startsWith("pending_")
    );
  });

  const currency = invoicesPage.items[0]?.currency ?? "USD";
  const outstandingCents = invoicesPage.items
    .filter((i) => i.status !== "void")
    .reduce((sum, i) => sum + Math.max(0, i.totalCents - i.paidCents), 0);
  const overdueCount = invoicesPage.items.filter(
    (i) => i.status === "overdue"
  ).length;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div className="space-y-2">
          <Eyebrow>// Overview</Eyebrow>
          <h1 className="text-[36px] font-semibold leading-tight tracking-tighter text-fg">
            {myOrg?.displayName ?? "Your organization"}
          </h1>
          <p className="text-[14px] text-fg-muted">
            Welcome back. Here's what's happening across your organization.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/seasons"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            Manage seasons
            <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
          </Link>
          <Link
            href="/finance"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            Finance
            <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
          </Link>
        </div>
      </header>

      {/* KPI tiles */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Trophy}
          label="Active leagues"
          value={String(activeLeagues.length)}
          hint={`${leaguesPage.items.length} total`}
          tint="blue"
        />
        <Kpi
          icon={CalendarRange}
          label="Open seasons"
          value={String(openSeasons.length)}
          hint={`${seasonsPage.items.length} total`}
          tint="violet"
        />
        <Kpi
          icon={ClipboardList}
          label="Registrations to review"
          value={String(pendingRegs.length)}
          hint={`${registrationsPage.items.length} total submissions`}
          tint="amber"
        />
        <Kpi
          icon={Wallet}
          label="Outstanding AR"
          value={formatMoney(outstandingCents, currency)}
          hint={`${overdueCount} overdue`}
          tint={overdueCount > 0 ? "rose" : "emerald"}
        />
      </section>

      {/* Leagues */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Leagues</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              Every league owned by {myOrg?.displayName ?? "your org"}.
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            {leaguesPage.items.length} total
          </span>
        </header>
        {leaguesPage.items.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No leagues yet"
            description="Create the first league from the SportsPulse super-admin console."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>League</TH>
                <TH>Sport</TH>
                <TH>Format</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {leaguesPage.items.map((l) => (
                <TR key={l.id}>
                  <TD className="font-medium text-fg">{l.name}</TD>
                  <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">
                    {l.sportCode}
                  </TD>
                  <TD className="text-fg-muted">{l.format ?? "—"}</TD>
                  <TD>
                    <Badge mono tone={l.status === "active" ? "success" : "neutral"}>
                      {l.status.replace(/_/g, " ")}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {/* Recent registrations */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Recent registrations</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              Newest registrations across every season in this org.
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            {registrationsPage.items.length} loaded
          </span>
        </header>
        {registrationsPage.items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No registrations yet"
            description="Registrations submitted via the public funnel will land here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>ID</TH>
                <TH>Subject</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {registrationsPage.items.slice(0, 10).map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {r.id.slice(0, 8)}
                  </TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {r.subjectPersonId.slice(0, 8)}
                  </TD>
                  <TD>
                    <Badge mono tone={statusToneFor(r.status)}>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {new Date(r.createdAt).toLocaleDateString()}
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

function statusToneFor(
  status: string
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "approved") return "success";
  if (status === "rejected" || status === "cancelled") return "danger";
  if (status.startsWith("pending")) return "warning";
  return "info";
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tint
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tint: "blue" | "violet" | "amber" | "rose" | "emerald" | "cyan" | "neutral";
}) {
  const Icon = icon;
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        <IconTile icon={Icon} tint={tint} size="sm" />
      </div>
      <p className="mt-5 font-mono text-[28px] font-semibold tabular-nums tracking-tight text-fg">
        {value}
      </p>
      <p className="mt-1 text-[12px] text-fg-muted">{hint}</p>
    </div>
  );
}

function ShellWithoutOrg({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-16">
      <Eyebrow>// sp-org-admin</Eyebrow>
      <h1 className="text-[36px] font-semibold tracking-tighter text-fg">
        Org Admin
      </h1>
      <EmptyState
        icon={Building2}
        title="No organization yet"
        description={message}
      />
      <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        // contact your platform admin
      </p>
      <div className="hidden">
        {/* keep the symbol referenced so tree-shaking doesn't drop it */}
        <CircleDollarSign className="h-3 w-3" />
      </div>
    </main>
  );
}
