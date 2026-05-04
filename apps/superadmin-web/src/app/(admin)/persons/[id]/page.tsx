import {
  ArrowLeft,
  CalendarRange,
  ClipboardList,
  FileSignature,
  Globe2,
  Gavel,
  ListChecks,
  MessageSquare,
  ShieldCheck,
  UserCircle2,
  type LucideIcon
} from "lucide-react";
import { EditPersonButton } from "@/components/persons/edit-person-button";
import { LinkPersonButton } from "@/components/persons/link-person-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  communications,
  compliance,
  gameOps,
  iam,
  leagueMgmt,
  registration,
  roster
} from "@/lib/api/server-api";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge, statusTone } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";

export const metadata = { title: "Person — SportsPulse" };

function age(dob: string | null): number | null {
  if (!dob) return null;
  return Math.floor(
    (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000)
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function PersonDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const person = await iam.getPerson(id).catch(() => null);
  if (!person) notFound();

  const [
    eligibility,
    signatures,
    suspensions,
    memberships,
    rosterMoves,
    registrations,
    teamsPage,
    seasonsPage,
    notifications
  ] = await Promise.all([
    compliance
      .listEligibility({ personId: id, limit: 50 })
      .catch(() => ({ items: [], nextCursor: null })),
    compliance.signaturesByPerson(id).catch(() => []),
    gameOps
      .listSuspensions({ personId: id, limit: 50 })
      .catch(() => ({ items: [], nextCursor: null })),
    roster
      .listMemberships({ personId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    roster
      .listMoves({ personId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    registration
      .listRegistrations({ subjectPersonId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listTeams({}).catch(() => ({ items: [], nextCursor: null })),
    leagueMgmt.listSeasons().catch(() => ({ items: [], nextCursor: null })),
    communications.forPerson(id).catch(() => [])
  ]);

  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );
  const seasonMap = new Map(
    seasonsPage.items.map((s) => [s.id, s.name])
  );

  const display =
    person.preferredName ?? `${person.legalFirstName} ${person.legalLastName}`;
  const yrs = age(person.dobDate);

  const activeMemberships = memberships.items.filter(
    (m) => m.currentStatus === "active"
  );
  const activeSuspensions = suspensions.items.filter(
    (s) => s.status === "active"
  );
  const activeSignatures = signatures.filter((s) => !s.revokedAt);
  const eligibleNow = eligibility.items.filter(
    (e) => e.status === "eligible" || e.status === "waived"
  );

  return (
    <div className="space-y-10">
      <Link
        href="/persons"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All persons
      </Link>

      {/* Profile header */}
      <header className="flex items-start justify-between gap-6 border-b border-border pb-8">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[var(--tint-violet-bg)] text-[var(--tint-violet-fg)]">
            <UserCircle2 className="h-8 w-8" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <Eyebrow dot>Person · {person.id.slice(0, 8)}</Eyebrow>
            <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tighter text-fg">
              {display}
            </h1>
            {person.preferredName ? (
              <p className="text-[13px] text-fg-muted">
                Legal: {person.legalFirstName} {person.legalLastName}
              </p>
            ) : null}
            <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-fg-muted">
              <li className="inline-flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
                {person.dobDate
                  ? `${fmtDate(person.dobDate)} · age ${yrs}`
                  : "DOB unknown"}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                {person.countryCode ?? "country —"}
              </li>
              <li className="inline-flex items-center gap-1.5">
                {person.userId ? (
                  <Badge tone="success" mono>
                    AUTH LINKED
                  </Badge>
                ) : (
                  <Badge mono>NO ACCOUNT</Badge>
                )}
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <EditPersonButton person={person} />
              {!person.userId ? <LinkPersonButton personId={person.id} /> : null}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3 text-right">
          <Kpi
            label="Eligible"
            value={eligibleNow.length}
            total={eligibility.items.length}
          />
          <Kpi
            label="Active suspensions"
            value={activeSuspensions.length}
            total={suspensions.items.length}
            tone={activeSuspensions.length > 0 ? "danger" : undefined}
          />
          <Kpi
            label="Signatures"
            value={activeSignatures.length}
            total={signatures.length}
          />
          <Kpi
            label="Active rosters"
            value={activeMemberships.length}
            total={memberships.items.length}
          />
        </div>
      </header>

      {/* Eligibility timeline */}
      <Section
        icon={ShieldCheck}
        tint="emerald"
        eyebrow="Eligibility"
        title="Eligibility timeline"
        description="Per-season, per-governing-body decisions. Newest first."
      >
        {eligibility.items.length === 0 ? (
          <Empty message="No eligibility records." />
        ) : (
          <ol className="space-y-3">
            {eligibility.items.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[16px_1fr_auto] items-start gap-4"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 rounded-full ${
                    e.status === "eligible"
                      ? "bg-emerald-500"
                      : e.status === "waived"
                        ? "bg-blue-500"
                        : e.status === "ineligible"
                          ? "bg-rose-500"
                          : e.status === "expired"
                            ? "bg-amber-500"
                            : "bg-fg-muted"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    <Badge tone={statusTone(e.status)} mono>
                      {e.status}
                    </Badge>
                    <span className="ml-2 text-fg-muted">
                      {e.seasonId
                        ? (seasonMap.get(e.seasonId) ?? e.seasonId.slice(0, 8))
                        : "Platform-wide"}
                    </span>
                  </p>
                  {e.waiverReason ? (
                    <p className="mt-1 text-[13px] text-fg-muted">
                      Waiver: {e.waiverReason}
                    </p>
                  ) : null}
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {fmtDate(e.effectiveFrom)}
                    {e.effectiveTo ? ` → ${fmtDate(e.effectiveTo)}` : " → open"}
                  </p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                  {fmtDateTime(e.evaluatedAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Document signatures */}
      <Section
        icon={FileSignature}
        tint="violet"
        eyebrow="Consent"
        title="Document signatures"
        description="Each consent signature is bound to a specific document version + IP."
      >
        {signatures.length === 0 ? (
          <Empty message="No signatures on record." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Document version</TH>
                <TH>Signed</TH>
                <TH>IP</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {signatures.map((s) => (
                <TR key={s.id}>
                  <TD className="font-mono text-[12px] text-fg">
                    {s.documentVersionId.slice(0, 8)}
                  </TD>
                  <TD className="text-fg-muted">{fmtDateTime(s.signedAt)}</TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {s.ipAddr ?? "—"}
                  </TD>
                  <TD>
                    {s.revokedAt ? (
                      <Badge tone="danger" mono>
                        REVOKED
                      </Badge>
                    ) : (
                      <Badge tone="success" mono>
                        ACTIVE
                      </Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {/* Suspensions */}
      <Section
        icon={Gavel}
        tint="rose"
        eyebrow="Discipline"
        title="Suspension history"
        description="Match misconduct, automatic sit-outs, and admin-issued bans."
      >
        {suspensions.items.length === 0 ? (
          <Empty message="No suspensions — clean record." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Kind</TH>
                <TH>Status</TH>
                <TH className="text-center">Served</TH>
                <TH>Reason</TH>
                <TH>Period</TH>
              </TR>
            </THead>
            <TBody>
              {suspensions.items.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-fg">
                      {s.kind.replace(/_/g, " ")}
                    </span>
                  </TD>
                  <TD>
                    <Badge tone={statusTone(s.status)} mono>
                      {s.status}
                    </Badge>
                  </TD>
                  <TD className="text-center font-mono tabular-nums text-fg">
                    {s.servedCount}
                    {s.nGames ? ` / ${s.nGames}` : ""}
                  </TD>
                  <TD className="text-fg-muted">{s.reason ?? "—"}</TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {fmtDate(s.startAt)}
                    {s.endAt ? ` → ${fmtDate(s.endAt)}` : ""}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {/* Notifications */}
      <Section
        icon={MessageSquare}
        tint="blue"
        eyebrow="Communications"
        title="Recent notifications"
        description="Outbound messages addressed to this person — newest first."
      >
        {notifications.length === 0 ? (
          <Empty message="No notifications sent to this person." />
        ) : (
          <ul className="divide-y divide-border">
            {notifications.slice(0, 8).map((n) => (
              <li
                key={n.id}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {n.subject ?? n.templateCode}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {n.templateCode} · {n.channel}
                  </p>
                </div>
                <div className="text-right">
                  <Badge tone={statusTone(n.status === "sent" ? "completed" : n.status)} mono>
                    {n.status}
                  </Badge>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {fmtDateTime(n.sentAt ?? n.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Memberships + Roster moves + Registrations grid */}
      <section className="grid gap-6 lg:grid-cols-3">
        <Mini
          icon={ListChecks}
          tint="blue"
          eyebrow="Rosters"
          title="Active memberships"
          empty={activeMemberships.length === 0 ? "Not on any roster." : null}
        >
          <ul className="divide-y divide-border">
            {activeMemberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {teamMap.get(m.teamId) ?? m.teamId.slice(0, 8)}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {seasonMap.get(m.seasonId) ?? m.seasonId.slice(0, 8)} ·{" "}
                    {m.membershipType.replace(/_/g, " ")}
                  </p>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-fg">
                  {m.jerseyNumber !== null ? `#${m.jerseyNumber}` : ""}
                  {m.positionCode ? ` ${m.positionCode}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Mini>

        <Mini
          icon={ClipboardList}
          tint="amber"
          eyebrow="Registrations"
          title="Registration history"
          empty={
            registrations.items.length === 0 ? "No registrations yet." : null
          }
        >
          <ul className="divide-y divide-border">
            {registrations.items.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {r.leagueId
                      ? `League ${r.leagueId.slice(0, 8)}`
                      : "Org-level"}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {fmtDate(r.submittedAt ?? r.createdAt)}
                  </p>
                </div>
                <Badge tone={statusTone(r.status)} mono>
                  {r.status.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </Mini>

        <Mini
          icon={ListChecks}
          tint="cyan"
          eyebrow="Moves"
          title="Roster moves (event log)"
          empty={rosterMoves.items.length === 0 ? "No roster moves." : null}
        >
          <ul className="divide-y divide-border">
            {rosterMoves.items.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    <span className="font-mono text-[11px] uppercase tracking-wide">
                      {m.moveType.replace(/_/g, " ")}
                    </span>
                    <span className="ml-2 text-fg-muted">
                      {teamMap.get(m.teamId) ?? m.teamId.slice(0, 8)}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {fmtDateTime(m.effectiveAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Mini>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  total,
  tone
}: {
  label: string;
  value: number;
  total?: number;
  tone?: "danger";
}) {
  return (
    <div className="min-w-[110px] rounded-lg border border-border bg-surface-1 px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p
        className={
          "mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight " +
          (tone === "danger"
            ? "text-rose-600 dark:text-rose-400"
            : "text-fg")
        }
      >
        {value}
        {total !== undefined ? (
          <span className="text-[12px] text-fg-muted"> / {total}</span>
        ) : null}
      </p>
    </div>
  );
}

function Section({
  icon,
  tint,
  eyebrow,
  title,
  description,
  children
}: {
  icon: LucideIcon;
  tint: "violet" | "emerald" | "amber" | "blue" | "rose" | "cyan";
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <IconTile icon={Icon} tint={tint} size="sm" />
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">
            {title}
          </p>
          {description ? (
            <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
          ) : null}
        </div>
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function Mini({
  icon,
  tint,
  eyebrow,
  title,
  empty,
  children
}: {
  icon: LucideIcon;
  tint: "violet" | "emerald" | "amber" | "blue" | "rose" | "cyan";
  eyebrow: string;
  title: string;
  empty: string | null;
  children: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <IconTile icon={Icon} tint={tint} size="sm" />
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <p className="mt-0.5 text-sm font-semibold tracking-tight text-fg">
            {title}
          </p>
        </div>
      </header>
      {empty ? <Empty message={empty} /> : children}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-fg-muted">{message}</p>
  );
}
