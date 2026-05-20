/* Hallmark · page: dashboard · genre: editorial · theme: project (sp-org-admin)
 * macrostructure: PageHeader · SectionRail(01 Pulse) → 4-up KPI grid ·
 *                 SectionRail(02 Leagues) → table-shell · SectionRail(03 Activity) → table-shell
 * states: success (data present), empty (no rows), error (catch → empty fallback)
 * pre-emit critique: P5 H4 E5 S4 R5 V4
 */
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CalendarRange,
  ClipboardList,
  Layers,
  ScrollText,
  Trophy,
  Wallet
} from "lucide-react";
import {
  Badge,
  EmptyState,
  Eyebrow,
  Reveal,
  SectionRail,
  StatTile,
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
import { PageHeader } from "@/components/layout/page-header";
import { getActiveOrgId } from "@/lib/active-org";

export const dynamic = "force-dynamic";

function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

export default async function OrgAdminHome() {
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
    <div className="space-y-14">
      <PageHeader
        eyebrow="// Overview"
        title={myOrg?.displayName ?? "Your organization"}
        description="Welcome back. Here's what's happening across your organization."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/seasons"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors duration-fast ease-ease hover:border-fg-muted hover:text-fg"
            >
              Manage seasons
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
            </Link>
            <Link
              href="/finance"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted transition-colors duration-fast ease-ease hover:border-fg-muted hover:text-fg"
            >
              Finance
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
            </Link>
          </div>
        }
      />

      {/* 01 · Pulse — KPI grid */}
      <section className="space-y-6">
        <Reveal>
          <SectionRail
            index="01"
            label="Pulse"
            subtitle="The four numbers that matter today — leagues, seasons, registrations waiting, and money outstanding."
            meta={`as of ${new Date().toLocaleDateString("en-CA")}`}
          />
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Reveal delay={0.04}>
            <StatTile
              icon={Trophy}
              label="Active leagues"
              value={String(activeLeagues.length)}
              hint={`${leaguesPage.items.length} total`}
              tone="blue"
            />
          </Reveal>
          <Reveal delay={0.08}>
            <StatTile
              icon={CalendarRange}
              label="Open seasons"
              value={String(openSeasons.length)}
              hint={`${seasonsPage.items.length} total`}
              tone="violet"
            />
          </Reveal>
          <Reveal delay={0.12}>
            <StatTile
              icon={ClipboardList}
              label="Registrations to review"
              value={String(pendingRegs.length)}
              hint={`${registrationsPage.items.length} total submissions`}
              tone="amber"
            />
          </Reveal>
          <Reveal delay={0.16}>
            <StatTile
              icon={Wallet}
              label="Outstanding AR"
              value={formatMoney(outstandingCents, currency)}
              hint={
                overdueCount > 0
                  ? `${overdueCount} overdue`
                  : "No overdue invoices"
              }
              tone={overdueCount > 0 ? "rose" : "emerald"}
            />
          </Reveal>
        </div>
      </section>

      {/* 02 · Leagues — table shell */}
      <section className="space-y-6">
        <Reveal>
          <SectionRail
            index="02"
            label="Leagues"
            subtitle={`Every league owned by ${myOrg?.displayName ?? "your org"}. Drill in to manage seasons, divisions, and rosters.`}
            meta={`// ${leaguesPage.items.length} total`}
          />
        </Reveal>
        <Reveal delay={0.06}>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
            {leaguesPage.items.length === 0 ? (
              <div className="px-6 py-12">
                <EmptyState
                  icon={Layers}
                  title="No leagues yet"
                  description="Kick off setup by creating your first league."
                />
                <div className="mt-4 flex justify-center">
                  <Link
                    href="/org-setup"
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg transition-colors duration-fast ease-ease hover:bg-[var(--accent-hover)]"
                  >
                    Open org setup
                    <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
                  </Link>
                </div>
              </div>
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
                      <TD className="font-medium text-fg">
                        <Link
                          href={`/leagues/${l.id}`}
                          className="hover:text-accent"
                        >
                          {l.name}
                        </Link>
                      </TD>
                      <TD className="font-mono text-[11px] uppercase tracking-wide text-fg-muted">
                        {l.sportCode}
                      </TD>
                      <TD className="text-fg-muted">{l.format ?? "—"}</TD>
                      <TD>
                        <Badge
                          mono
                          tone={l.status === "active" ? "success" : "neutral"}
                        >
                          {l.status.replace(/_/g, " ")}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Reveal>
      </section>

      {/* 03 · Activity — recent registrations */}
      <section className="space-y-6">
        <Reveal>
          <SectionRail
            index="03"
            label="Activity"
            subtitle="The newest registrations across every season in this org. Approve them from the registrations queue when they're ready."
            meta={`// ${registrationsPage.items.length} loaded`}
          />
        </Reveal>
        <Reveal delay={0.06}>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
            {registrationsPage.items.length === 0 ? (
              <div className="px-6 py-12">
                <EmptyState
                  icon={ScrollText}
                  title="No registrations yet"
                  description="Registrations submitted via the public funnel will land here."
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>ID</TH>
                    <TH>Subject</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Created</TH>
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
                      <TD className="text-right text-[12px] text-fg-muted">
                        {new Date(r.createdAt).toLocaleDateString("en-CA")}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Reveal>
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
    </main>
  );
}
