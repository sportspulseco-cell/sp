import { DATE_FORMATS, formatCalendarDate } from "@sportspulse/kernel";
import { fetchAll, load } from "@sportspulse/api-client";
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
import {
  IssueSuspensionButton,
  ChangeSuspensionGamesButton,
  LiftSuspensionButton
} from "@/components/discipline/suspension-buttons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, LoadError, LocalDate } from "@sportspulse/ui";
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
import { IconTile } from "@/components/ui/icon-tile";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";

export const metadata = { title: "Person · Super Admin" };

function age(dob: string | null): number | null {
  if (!dob) return null;
  return Math.floor(
    (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000)
  );
}

function fmtDate(iso: string | null): string {
  return formatCalendarDate(iso, DATE_FORMATS.date) || "—";
}

function fmtDateTime(iso: string | null) {
  return <LocalDate iso={iso} format="dateTime" fallback="—" />;
}

export default async function PersonDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const personResult = await load(iam.getPerson(id));
  if (!personResult.ok) {
    if (personResult.status === 404) notFound();
    return (
      <LoadError
        what="this person"
        status={personResult.status}
        message={personResult.message}
        action={
          <Link
            href="/persons"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            All persons
          </Link>
        }
      />
    );
  }
  const person = personResult.data;

  const [
    eligibility,
    signatures,
    suspensions,
    memberships,
    rosterMoves,
    registrations,
    teamsPage,
    seasonsPage,
    notifications,
    leaguesPage
  ] = await Promise.all([
    compliance
      .listEligibility({ personId: id, limit: 50 })
      .catch(() => ({ items: [], nextCursor: null })),
    compliance.signaturesByPerson(id).catch(() => []),
    // A failed read must not render as "clean record" (COMP-10).
    load(gameOps.listSuspensions({ personId: id, limit: 50 })),
    roster
      .listMemberships({ personId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    roster
      .listMoves({ personId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    registration
      .listRegistrations({ subjectPersonId: id })
      .catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt.listTeams({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
    fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null })),
    communications.forPerson(id).catch(() => []),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch(() => ({ items: [], nextCursor: null }))
  ]);

  const teamMap = new Map(
    teamsPage.items.map((t) => [t.id, t.shortName ?? t.name])
  );
  const seasonMap = new Map(
    seasonsPage.items.map((s) => [s.id, s.name])
  );
  const leagueMap = new Map(
    leaguesPage.items.map((l) => [l.id, l.name])
  );

  const display =
    person.preferredName ?? `${person.legalFirstName} ${person.legalLastName}`;
  const yrs = age(person.dobDate);

  const activeMemberships = memberships.items.filter(
    (m) => m.currentStatus === "active"
  );
  const suspensionItems = suspensions.ok ? suspensions.data.items : [];
  const suspensionPerms = suspensions.ok ? (suspensions.data.viewerPermissions ?? []) : [];
  const canIssue = suspensionPerms.includes("suspension.issue");
  const canLift = suspensionPerms.includes("suspension.lift");
  // Server-computed: a dated suspension past its date is not standing.
  const activeSuspensions = suspensionItems.filter((s) => s.inForce);
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
            <Eyebrow dot>Person · {person.userId ? "Has account" : "No account"}</Eyebrow>
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
                {person.countryCode ?? "No country"}
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
            total={suspensionItems.length}
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
                    <Badge status={e.status} />
                    <span className="ml-2 text-fg-muted">
                      {e.seasonId
                        ? (seasonMap.get(e.seasonId) ?? "Unknown season")
                        : "Platform-wide"}
                    </span>
                  </p>
                  {e.waiverReason && e.status === "waived" ? (
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
                  <TD className="text-[12px] text-fg">
                    {s.documentName ?? "Unknown document"}
                    {s.documentVersionNumber != null ? ` · v${s.documentVersionNumber}` : ""}
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

      {/* Suspensions (UC-14, COMP-10) */}
      <Section
        icon={Gavel}
        tint="rose"
        eyebrow="Discipline"
        title="Suspensions"
        description="Game-count suspensions are counted down when the player's team finalizes a game."
        action={
          canIssue ? (
            <IssueSuspensionButton personId={person.id} personName={display} />
          ) : null
        }
      >
        {!suspensions.ok ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            Could not load suspensions ({suspensions.status}): {suspensions.message}
          </p>
        ) : suspensionItems.length === 0 ? (
          <Empty message="No suspensions on record." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Status</TH>
                <TH>Length</TH>
                <TH>Reason</TH>
                <TH>Started</TH>
                <TH>From</TH>
                <TH className="text-right">{canLift ? "Action" : ""}</TH>
              </TR>
            </THead>
            <TBody>
              {suspensionItems.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <Badge status={s.inForce ? "suspended" : s.status === "active" ? "ended" : s.status} />
                  </TD>
                  <TD className="text-fg">{s.label}</TD>
                  <TD className="max-w-[320px] text-fg-muted">{s.reason ?? "No reason recorded"}</TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {fmtDate(s.startAt)}
                    {s.endAt && !s.inForce ? ` → ${fmtDate(s.endAt)}` : ""}
                  </TD>
                  <TD className="text-[12px]">
                    {s.sourceGameId ? (
                      <Link href={`/games/${s.sourceGameId}`} className="text-fg underline-offset-2 hover:underline">
                        Penalty in game
                      </Link>
                    ) : (
                      <span className="text-fg-muted">Admin</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    {canLift && s.inForce ? (
                      <span className="inline-flex gap-1.5">
                        {s.kind === "n_games" || s.kind === "indefinite" ? (
                          <ChangeSuspensionGamesButton
                            suspensionId={s.id}
                            personName={display}
                            label={s.label}
                            currentGames={s.nGames}
                            servedCount={s.servedCount}
                          />
                        ) : null}
                        <LiftSuspensionButton suspensionId={s.id} personName={display} label={s.label} />
                      </span>
                    ) : null}
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
        description="Outbound messages addressed to this person, newest first."
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
                  <Badge status={n.status} domain="notification" />
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
                    {teamMap.get(m.teamId) ?? "Unnamed team"}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {seasonMap.get(m.seasonId) ?? "Unknown season"} ·{" "}
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
                      ? (leagueMap.get(r.leagueId) ?? "Unknown league")
                      : "Org-level"}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    <LocalDate iso={r.submittedAt ?? r.createdAt} format="date" fallback="—" />
                  </p>
                </div>
                <Badge status={r.status} />
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
                      {teamMap.get(m.teamId) ?? "Unnamed team"}
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
  action,
  children
}: {
  icon: LucideIcon;
  tint: "violet" | "emerald" | "amber" | "blue" | "rose" | "cyan";
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <IconTile icon={Icon} tint={tint} size="sm" />
        <div className="min-w-0 flex-1">
          <Eyebrow>{eyebrow}</Eyebrow>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">
            {title}
          </p>
          {description ? (
            <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
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
