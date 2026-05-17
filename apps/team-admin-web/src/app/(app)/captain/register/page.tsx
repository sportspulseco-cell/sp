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
import { Badge, EmptyState, Eyebrow } from "@sportspulse/ui";
import { captain, iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { WithdrawButton } from "./withdraw-button";

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

  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;
  const teamId = scope?.teamIds[0] ?? null;

  if (!isCaptain || !teamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// captain console" title="Register your team" />
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

  const [openSeasons, applications] = await Promise.all([
    captain.openSeasons(teamId).catch(() => ({ items: [] })),
    captain.myApplications(teamId).catch(() => ({ items: [] }))
  ]);

  if (submitted) {
    const justSubmitted = applications.items.find(
      (a) => a.id === submitted && a.entryStatus === "pending_approval"
    );
    if (justSubmitted) {
      return (
        <div className="space-y-6">
          <PageHeader
            eyebrow="// captain console"
            title="Register your team"
          />
          <SubmittedSuccessCard teamName={teamName} app={justSubmitted} />
        </div>
      );
    }
  }

  const activeApp = applications.items.find(
    (a) =>
      a.entryStatus === "pending_approval" ||
      a.entryStatus === "applied" ||
      a.entryStatus === "accepted" ||
      a.entryStatus === "confirmed"
  );
  const lastRejection = applications.items.find(
    (a) => a.entryStatus === "rejected"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// captain console"
        title="Register your team"
        description="Open seasons your team can register for. Select a season to view available divisions."
      />

      {activeApp && activeApp.entryStatus === "pending_approval" && (
        <PendingApplicationCard app={activeApp} />
      )}

      {activeApp &&
        (activeApp.entryStatus === "applied" ||
          activeApp.entryStatus === "accepted" ||
          activeApp.entryStatus === "confirmed") && (
          <ApprovedDetailCard teamName={teamName} app={activeApp} />
        )}

      {!activeApp && lastRejection && (
        <RejectionDetailCard app={lastRejection} />
      )}

      {openSeasons.items.length === 0 ? (
        !activeApp && !lastRejection && (
          <EmptyState
            icon={Sparkles}
            title="No open registrations"
            description="No seasons are currently open for registration in your org. They'll appear here the moment your league admin opens a window."
          />
        )
      ) : (
        <section className="space-y-3">
          <Eyebrow>// other open seasons</Eyebrow>
          <ul className="space-y-3">
            {openSeasons.items.map((s) => (
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
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40">
          <Send className="h-6 w-6 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
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
          <Eyebrow>// what happens next</Eyebrow>
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
    <section className="rounded-2xl border border-amber-400/40 bg-amber-50/70 p-5 dark:border-amber-700/40 dark:bg-amber-950/30">
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
  const setupHref = `/captain/register/setup/${app.id}`;
  return (
    <section className="rounded-2xl border border-emerald-400/40 bg-emerald-50/70 p-6 dark:border-emerald-700/40 dark:bg-emerald-950/30">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
        </div>
        <h2 className="mt-3 text-[18px] font-semibold tracking-tight text-fg">
          {isConfirmed ? "You're confirmed!" : "Application approved!"}
        </h2>
        <p className="mt-1.5 max-w-md text-[13px] text-fg-muted">
          {isConfirmed ? (
            <>
              {teamName} is confirmed for{" "}
              <span className="font-medium text-fg">{app.divisionName}</span> in{" "}
              <span className="font-medium text-fg">{app.seasonName}</span>.
            </>
          ) : (
            <>
              {teamName} has been accepted into{" "}
              <span className="font-medium text-fg">{app.divisionName}</span> for{" "}
              <span className="font-medium text-fg">{app.seasonName}</span>. Complete your setup to confirm your spot.
            </>
          )}
        </p>
      </div>

      <dl className="mt-5 divide-y divide-emerald-500/20 rounded-xl border border-emerald-500/20 bg-bg-subtle text-[13px]">
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
            app.thresholdCents > 0
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
        <Eyebrow>// what to do now</Eyebrow>
        <StepList
          steps={[
            { status: "done", title: "Application submitted" },
            { status: "done", title: "Admin approved your application" },
            {
              status: isConfirmed ? "done" : "current",
              title: "Invite your players and configure dues split"
            },
            {
              status: isConfirmed ? "done" : "future",
              title: "Collect deposits to confirm your spot"
            }
          ]}
        />
      </div>

      <Link
        href={isConfirmed ? "/" : setupHref}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2.5 text-[13px] font-medium text-white hover:bg-emerald-700"
      >
        {isConfirmed ? "Open team console" : "Set up roster & dues"}
        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
      </Link>
    </section>
  );
}

function RejectionDetailCard({ app }: { app: Application }) {
  const meta = (app.metadata as {
    rejectionReason?: string;
    rejectedAt?: string;
  }) ?? {};
  return (
    <section className="rounded-2xl border border-rose-400/40 bg-rose-50/70 p-6 dark:border-rose-700/40 dark:bg-rose-950/30">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-500/40">
          <XCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" strokeWidth={1.75} />
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
        <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-100/60 p-4 dark:bg-rose-950/40">
          <p className="font-mono text-[10px] uppercase tracking-widest text-rose-700 dark:text-rose-300">
            Reason from admin
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg">
            {meta.rejectionReason}
          </p>
        </div>
      )}

      <dl className="mt-4 divide-y divide-rose-500/20 rounded-xl border border-rose-500/20 bg-bg-subtle text-[13px]">
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
    ? new Date(season.startDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      })
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
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-300">
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
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(cents / 100);
}
