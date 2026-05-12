import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Sparkles,
  Trophy,
  XCircle
} from "lucide-react";
import { Badge, EmptyState, Eyebrow } from "@sportspulse/ui";
import { captain, iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { WithdrawButton } from "./withdraw-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Register your team — SportsPulse" };

/**
 * Captain approval-gate. Same surface as team-admin-web's
 * /captain/register but mounted on player-web so captains signed in
 * to the player console land here too. Backed by the same SDK +
 * approval-gate API (Spec 1 — Team Registration via Admin Approval).
 *
 * Three sub-states:
 *   - Pending application → status card + Withdraw
 *   - Approved → "Continue setup" link (team-admin-web has the wizard)
 *   - Rejected → reason + apply-to-different-division link
 *   - No active app → list of seasons currently open for registration
 */
export default async function CaptainRegisterPage() {
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
        description="Apply to a division. After admin approval, you'll set up roster + dues from the team admin console."
      />

      {activeApp ? (
        <ActiveApplicationCard teamName={teamName} app={activeApp} />
      ) : (
        <>
          {lastRejection && (
            <RejectionCard teamName={teamName} app={lastRejection} />
          )}

          {openSeasons.items.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No open registrations"
              description="No seasons are currently open for registration in your org. They'll appear here the moment your league admin opens a window."
            />
          ) : (
            <section className="space-y-3">
              <Eyebrow>// open seasons</Eyebrow>
              <ul className="grid gap-3 md:grid-cols-2">
                {openSeasons.items.map((s) => (
                  <li key={s.seasonId}>
                    <Link
                      href={`/captain/register/${s.seasonId}`}
                      className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface-1 p-5 hover:border-accent"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
                            {s.leagueName}
                          </p>
                          <p className="mt-1 truncate text-[16px] font-semibold tracking-tight text-fg">
                            {s.seasonName}
                          </p>
                        </div>
                        <Trophy
                          className="h-5 w-5 shrink-0 text-fg-muted group-hover:text-accent"
                          strokeWidth={1.5}
                        />
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
                          <CalendarRange className="h-3 w-3" strokeWidth={1.75} />
                          closes{" "}
                          {s.registrationClosesAt
                            ? new Date(s.registrationClosesAt).toLocaleDateString()
                            : "—"}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                          {s.availableDivisions} division
                          {s.availableDivisions === 1 ? "" : "s"}
                          <ArrowRight className="h-3 w-3" strokeWidth={2} />
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ActiveApplicationCard({
  teamName,
  app
}: {
  teamName: string;
  app: {
    id: string;
    entryStatus: string;
    createdAt: string;
    divisionName: string;
    seasonName: string;
    leagueName: string;
  };
}) {
  const isPending = app.entryStatus === "pending_approval";
  const isApproved =
    app.entryStatus === "applied" ||
    app.entryStatus === "accepted" ||
    app.entryStatus === "confirmed";

  return (
    <section
      className={`rounded-2xl border p-6 ${
        isPending
          ? "border-amber-400/40 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/30"
          : "border-emerald-400/40 bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-950/30"
      }`}
    >
      <div className="flex items-start gap-3">
        {isPending ? (
          <Clock className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
        ) : (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {app.leagueName} · {app.seasonName}
          </p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-fg">
            {isPending
              ? "Application pending review"
              : `${teamName} is approved`}
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            {isPending
              ? `Submitted to ${app.divisionName} on ${new Date(app.createdAt).toLocaleDateString()}. The league admin will review and notify you.`
              : `You're cleared to set up your roster and dues for ${app.divisionName}.`}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone={isPending ? "warning" : "success"} mono>
              {app.entryStatus.replace(/_/g, " ")}
            </Badge>
            {isPending && <WithdrawButton entryId={app.id} />}
            {isApproved && (
              <a
                href={`https://sp-team-admin.vercel.app/captain/register/setup/${app.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Continue setup <ArrowRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RejectionCard({
  teamName: _teamName,
  app
}: {
  teamName: string;
  app: {
    seasonId: string;
    seasonName: string;
    divisionName: string;
    metadata: Record<string, unknown>;
  };
}) {
  const reason = (app.metadata as { rejectionReason?: string })?.rejectionReason;
  return (
    <section className="rounded-xl border border-rose-400/40 bg-rose-50 p-5 dark:border-rose-700/40 dark:bg-rose-950/30">
      <div className="flex items-start gap-3">
        <XCircle className="h-5 w-5 shrink-0 text-rose-700 dark:text-rose-300" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {app.seasonName}
          </p>
          <p className="mt-1 text-[15px] font-medium text-fg">
            Your application for {app.divisionName} was not approved.
          </p>
          {reason && (
            <p className="mt-1 text-[13px] text-fg-muted">Reason: {reason}</p>
          )}
          <Link
            href={`/captain/register/${app.seasonId}`}
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline"
          >
            Apply to a different division <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
