import { formatMoney } from "@sportspulse/kernel";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  CheckCircle2,
  Clock,
  Mail,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle
} from "lucide-react";
import { Badge, EmptyState, Eyebrow, LocalDate, LoadError } from "@sportspulse/ui";
import { DATE_FORMATS, formatCalendarDate, sortSeasonsByCurrency } from "@sportspulse/kernel";
import { captain, leagueMgmt, loadMeScope } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import {
  latestApplicationPerSeason,
  rejectionOf
} from "@/lib/registration-call";
import { WithdrawButton } from "./withdraw-button";
import { load } from "@sportspulse/api-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Register your team — SportsPulse" };

type Application = Awaited<
  ReturnType<typeof captain.myApplications>
>["items"][number];

type OpenSeason = Awaited<
  ReturnType<typeof captain.openSeasons>
>["items"][number];

/**
 * Captain approval-gate, team-admin-web edition. Single inline surface,
 * same state machine as player-web /captain/register but the "Set up
 * roster & dues" CTA stays in-app (same tab) because the wizard lives
 * here at /captain/register/setup/[entryId].
 */
export default async function CaptainRegisterPage({
  searchParams
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;

  const scope = await loadMeScope();
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const teamId = scope?.teamIds[0] ?? null;

  if (!isCaptain || !teamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="captain console" title="Register your team" />
        <EmptyState
          icon={ShieldAlert}
          title="Captain role required"
          description="Only the team's captain can register the team. Ask your league admin to assign the captain role."
        />
      </div>
    );
  }

  const team = await leagueMgmt.getTeam(teamId).catch(() => null);
  const teamName = team?.name ?? "Your team";

  const [openResult, applicationsResult] = await Promise.all([
    load(captain.openSeasons(teamId)),
    load(captain.myApplications(teamId))
  ]);
  const openSeasons = openResult.ok ? openResult.data : { items: [] };
  const applications = applicationsResult.ok ? applicationsResult.data : { items: [] };
  const loadFailure = !applicationsResult.ok ? applicationsResult : !openResult.ok ? openResult : null;

  if (submitted) {
    const justSubmitted = applications.items.find(
      (a) => a.id === submitted && a.entryStatus === "pending_approval"
    );
    if (justSubmitted) {
      return (
        <div className="space-y-6">
          <PageHeader
            eyebrow="captain console"
            title="Register your team"
          />
          <SubmittedSuccessCard teamName={teamName} app={justSubmitted} />
        </div>
      );
    }
  }

  // One card per season, from the newest application in that season.
  // Order: approved (set-up pending or awaiting deposits), pending
  // review, denied in a season that is still open (with the admin's
  // reason), then the seasons the team is confirmed in. The page used
  // to have one slot for "the active application" across every season,
  // so a denial for the next season hid behind "You're confirmed" for
  // the current one (CAP-5).
  const latest = latestApplicationPerSeason(applications.items);
  const openIds = new Set(openSeasons.items.map((s) => s.seasonId));
  const today = new Date().toISOString().slice(0, 10);
  const approvedApps = latest.filter(
    (a) => a.entryStatus === "applied" || a.entryStatus === "accepted"
  );
  const pendingApps = latest.filter(
    (a) => a.entryStatus === "pending_approval"
  );
  const deniedApps = latest.filter(
    (a) => a.entryStatus === "rejected" && openIds.has(a.seasonId)
  );
  const confirmedApps = sortSeasonsByCurrency(
    latest
      .filter(
        (a) =>
          a.entryStatus === "confirmed" &&
          (!a.seasonEndDate || a.seasonEndDate >= today)
      )
      .map((a) => ({
        ...a,
        startDate: a.seasonStartDate,
        endDate: a.seasonEndDate
      }))
  );
  const deniedSeasonIds = new Set(deniedApps.map((a) => a.seasonId));
  // The denied season is reachable from its own card ("Apply to a
  // different division"); do not list it twice.
  const otherOpen = openSeasons.items.filter(
    (s) => !deniedSeasonIds.has(s.seasonId)
  );
  const hasCards =
    approvedApps.length +
      pendingApps.length +
      deniedApps.length +
      confirmedApps.length >
    0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="captain console"
        title="Register your team"
        description="Your applications by season, and the open seasons your team can still register for."
      />

      {loadFailure ? (
        <LoadError
          what={!applicationsResult.ok ? "your applications" : "open seasons"}
          status={loadFailure.status}
          message={loadFailure.message}
        />
      ) : null}

      {approvedApps.map((a) => (
        <ApprovedDetailCard key={a.id} teamName={teamName} app={a} />
      ))}
      {pendingApps.map((a) => (
        <PendingApplicationCard key={a.id} app={a} />
      ))}
      {deniedApps.map((a) => (
        <RejectionDetailCard key={a.id} app={a} />
      ))}
      {confirmedApps.map((a) => (
        <ApprovedDetailCard key={a.id} teamName={teamName} app={a} />
      ))}

      {otherOpen.length === 0 ? (
        !hasCards && !loadFailure && (
          <EmptyState
            icon={Sparkles}
            title="No open registrations"
            description="No seasons are currently open for registration in your org. They'll appear here the moment your league admin opens a window."
          />
        )
      ) : (
        <section className="space-y-3">
          <Eyebrow>{hasCards ? "other open seasons" : "open seasons"}</Eyebrow>
          <ul className="space-y-3">
            {otherOpen.map((s) => (
              <li key={s.seasonId}>
                <SeasonCard season={s} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SubmittedSuccessCard({
  teamName,
  app
}: {
  teamName: string;
  app: Application;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-8">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--tint-emerald-bg)] ring-1 ring-[var(--tint-emerald-fg)]/40">
          <Send className="h-6 w-6 text-[var(--tint-emerald-fg)]" strokeWidth={1.75} />
        </div>
        <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-fg">
          Application submitted!
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
          Your application for <span className="font-medium text-fg">{app.divisionName}</span>{" "}
          in <span className="font-medium text-fg">{app.seasonName}</span> has been sent to the league admin for review.
        </p>

        <dl className="mt-6 w-full divide-y divide-border rounded-xl border border-border bg-bg-subtle text-[13px]">
          <DetailRow label="Team" value={teamName} />
          <DetailRow label="Season" value={app.seasonName} />
          <DetailRow label="Division" value={app.divisionName} />
          <DetailRow
            label="Applied"
            value={formatDateTime(app.createdAt)}
          />
          <DetailRow
            label="Status"
            value={<Badge tone="warning" mono>pending approval</Badge>}
          />
        </dl>

        <div className="mt-6 w-full space-y-2 text-left">
          <Eyebrow>what happens next</Eyebrow>
          <StepList
            steps={[
              { status: "done", title: "Application submitted", note: "league admin notified" },
              { status: "current", title: "Admin reviews your application and approves or denies it" },
              { status: "future", title: "If approved — you'll be directed to invite your players and set up dues" },
              { status: "future", title: "Once deposits collected — your team is confirmed and listed in the division" }
            ]}
          />
        </div>

        <Link
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-md border border-border bg-bg px-3 py-2 text-[13px] font-medium text-fg hover:bg-surface-1"
        >
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}

function PendingApplicationCard({ app }: { app: Application }) {
  return (
    <section className="rounded-2xl border border-[var(--tint-amber-fg)]/30 bg-[var(--tint-amber-bg)] p-5 dark:bg-[var(--tint-amber-bg)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold tracking-tight text-fg">
            {app.seasonName}
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            Applied to: <span className="font-medium text-fg">{app.divisionName}</span> ·{" "}
            {formatDate(app.createdAt)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
              Awaiting league admin review
            </span>
            {app.registrationClosesAt && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
                Closes {formatDate(app.registrationClosesAt)}
              </span>
            )}
          </div>
          <div className="mt-3">
            <WithdrawButton entryId={app.id} />
          </div>
        </div>
        <Badge tone="warning" mono>
          pending approval
        </Badge>
      </div>
    </section>
  );
}

function ApprovedDetailCard({
  teamName,
  app
}: {
  teamName: string;
  app: Application;
}) {
  const isConfirmed = app.entryStatus === "confirmed";
  // invoiceId is set once the roster + dues wizard ran: approved but not
  // yet set up -> "Set up roster & dues"; set up -> deposits in progress.
  const setupDone = !isConfirmed && !!app.invoiceId;
  // Confirmed with no team invoice: the league confirmed the team itself
  // (or placed it), so no dues were set up here. Never tick dues steps
  // that did not happen (MON-16).
  const confirmedWithoutDues = isConfirmed && !app.invoiceId;
  const setupHref = `/captain/register/setup/${app.id}`;
  return (
    <section className="rounded-2xl border border-[var(--tint-emerald-fg)]/30 bg-[var(--tint-emerald-bg)] p-6 dark:bg-[var(--tint-emerald-bg)]">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--tint-emerald-bg)] ring-1 ring-[var(--tint-emerald-fg)]/40">
          <CheckCircle2 className="h-6 w-6 text-[var(--tint-emerald-fg)]" strokeWidth={1.75} />
        </div>
        <h2 className="mt-3 text-[18px] font-semibold tracking-tight text-fg">
          {isConfirmed
            ? "You're confirmed!"
            : setupDone
              ? "Set-up complete, collecting deposits"
              : "Application approved!"}
        </h2>
        <p className="mt-1.5 max-w-md text-[13px] text-fg-muted">
          {isConfirmed ? (
            <>
              {teamName} is confirmed for{" "}
              <span className="font-medium text-fg">{app.divisionName}</span> in{" "}
              <span className="font-medium text-fg">{app.seasonName}</span>.
              {confirmedWithoutDues
                ? " Your league confirmed the team directly, so team dues were not set up in SportsPulse. Ask your league admin how the team pays."
                : null}
            </>
          ) : (
            <>
              {teamName} has been accepted into{" "}
              <span className="font-medium text-fg">{app.divisionName}</span> for{" "}
              <span className="font-medium text-fg">{app.seasonName}</span>.{" "}
              {setupDone
                ? "The team confirms once the deposit threshold is reached."
                : "Complete your setup to confirm your spot."}
            </>
          )}
        </p>
      </div>

      <dl className="mt-5 divide-y divide-emerald-500/20 rounded-xl border border-[var(--tint-emerald-fg)]/30 bg-bg-subtle text-[13px]">
        <DetailRow label="Division" value={app.divisionName} />
        <DetailRow
          label="Fee"
          value={
            app.feeCents != null
              ? formatMoney(app.feeCents, app.currency ?? "USD") + " per team"
              : "—"
          }
        />
        <DetailRow
          label="Confirms when"
          value={
            isConfirmed
              ? "Confirmed"
              : app.thresholdCents > 0
                ? formatMoney(app.thresholdCents, app.currency ?? "USD") +
                  " deposited"
                : "Threshold not set"
          }
        />
        <DetailRow
          label="Reg. closes"
          value={
            app.registrationClosesAt ? formatDate(app.registrationClosesAt) : "—"
          }
        />
      </dl>

      <div className="mt-5 space-y-2">
        <Eyebrow>what to do now</Eyebrow>
        <StepList
          steps={
            confirmedWithoutDues
              ? [
                  { status: "done", title: "Team confirmed in the division" },
                  { status: "current", title: "Invite your players" },
                  { status: "future", title: "Team dues: ask your league admin (not set up in SportsPulse)" }
                ]
              : [
                  { status: "done", title: "Application submitted" },
                  { status: "done", title: "Admin approved your application" },
                  {
                    status: isConfirmed || setupDone ? "done" : "current",
                    title: "Invite your players and configure dues split"
                  },
                  {
                    status: isConfirmed ? "done" : setupDone ? "current" : "future",
                    title: "Collect deposits to confirm your spot"
                  }
                ]
          }
        />
      </div>

      <Link
        href={confirmedWithoutDues ? "/captain/invites" : isConfirmed ? "/" : setupDone ? "/captain/dues" : setupHref}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--success)] px-3 py-2.5 text-[13px] font-medium text-white hover:bg-[var(--success)]"
      >
        {confirmedWithoutDues
          ? "Invite players"
          : isConfirmed
          ? "Open team console"
          : setupDone
            ? "View dues"
            : "Set up roster & dues"}
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    </section>
  );
}

function RejectionDetailCard({ app }: { app: Application }) {
  const decision = rejectionOf(app);
  const meta = {
    rejectionReason: decision.reason ?? undefined,
    rejectedAt: decision.rejectedAt ?? undefined
  };
  return (
    <section className="rounded-2xl border border-[var(--tint-rose-fg)]/30 bg-[var(--tint-rose-bg)] p-6 dark:bg-[var(--tint-rose-bg)]">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--tint-rose-bg)] ring-1 ring-[var(--tint-rose-fg)]/40">
          <XCircle className="h-6 w-6 text-[var(--tint-rose-fg)]" strokeWidth={1.75} />
        </div>
        <h2 className="mt-3 text-[18px] font-semibold tracking-tight text-fg">
          Application not approved
        </h2>
        <p className="mt-1.5 max-w-md text-[13px] text-fg-muted">
          Your application for{" "}
          <span className="font-medium text-fg">{app.divisionName}</span> in{" "}
          <span className="font-medium text-fg">{app.seasonName}</span> was not approved by the league admin.
        </p>
      </div>

      {meta.rejectionReason && (
        <div className="mt-5 rounded-xl border border-[var(--tint-rose-fg)]/30 bg-[var(--tint-rose-bg)] p-4 dark:bg-[var(--tint-rose-bg)]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--tint-rose-fg)]">
            Reason from admin
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg">
            {meta.rejectionReason}
          </p>
        </div>
      )}

      <dl className="mt-4 divide-y divide-rose-500/20 rounded-xl border border-[var(--tint-rose-fg)]/30 bg-bg-subtle text-[13px]">
        <DetailRow label="Division applied" value={app.divisionName} />
        <DetailRow
          label="Denied on"
          value={meta.rejectedAt ? formatDate(meta.rejectedAt) : "—"}
        />
        <DetailRow
          label="Reg. closes"
          value={
            app.registrationClosesAt ? formatDate(app.registrationClosesAt) : "—"
          }
        />
      </dl>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Link
          href={`/captain/register/${app.seasonId}`}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-[13px] font-medium text-fg hover:bg-surface-1"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
          Apply to a different division
        </Link>
        <Link
          href="/captain/team"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-[13px] font-medium text-fg hover:bg-surface-1"
        >
          <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
          Contact league admin
        </Link>
      </div>
    </section>
  );
}

function SeasonCard({ season }: { season: OpenSeason }) {
  const startStr = season.startDate
    ? formatCalendarDate(season.startDate, DATE_FORMATS.monthDay)
    : null;
  return (
    <Link
      href={`/captain/register/${season.seasonId}`}
      className="group block rounded-xl border border-border bg-surface-1 p-5 transition hover:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            {season.leagueName}
          </p>
          <p className="mt-1 text-[16px] font-semibold tracking-tight text-fg">
            {season.seasonName}
          </p>
          {season.registrationClosesAt && (
            <p className="mt-0.5 text-[12px] text-fg-muted">
              Registration closes {formatDate(season.registrationClosesAt)}
            </p>
          )}
        </div>
        <Badge tone="success" mono>
          open
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
        <SeasonStat
          value={season.availableDivisions}
          label="Divisions"
        />
        <SeasonStat
          value={season.teamsRegistered}
          label="Teams registered"
        />
        <SeasonStat
          value={startStr ?? "—"}
          label="Season starts"
        />
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-[12px] font-medium text-accent group-hover:underline">
        View divisions <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
    </Link>
  );
}

function SeasonStat({
  value,
  label
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div>
      <p className="text-[18px] font-semibold tracking-tight text-fg">
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        {label}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium text-fg">{value}</dd>
    </div>
  );
}

type Step = {
  status: "done" | "current" | "future";
  title: string;
  note?: string;
};

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <StepBullet status={s.status} index={i + 1} />
          <div className="min-w-0 flex-1 pt-0.5 text-[13px]">
            <p
              className={
                s.status === "future"
                  ? "text-fg-muted"
                  : "font-medium text-fg"
              }
            >
              {s.title}
              {s.note && (
                <span className="ml-1 font-normal text-fg-muted">— {s.note}</span>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepBullet({
  status,
  index
}: {
  status: Step["status"];
  index: number;
}) {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--tint-emerald-bg)] text-[var(--tint-emerald-fg)] ring-1 ring-[var(--tint-emerald-fg)]/40 dark:text-[var(--tint-emerald-fg)]">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-bg">
        {index}
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-medium text-fg-muted">
      {index}
    </span>
  );
}

function formatDate(iso: string) {
  return <LocalDate iso={iso} format="date" />;
}

function formatDateTime(iso: string) {
  return <LocalDate iso={iso} format="dateTime" />;
}

