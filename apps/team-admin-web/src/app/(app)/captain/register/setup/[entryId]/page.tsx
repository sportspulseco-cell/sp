import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { EmptyState } from "@sportspulse/ui";
import { captain, iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { RegisterWizard } from "./register-wizard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Set up registration — SportsPulse" };

/**
 * Workflow 7A 4-step rollover wizard.
 *
 * Only reachable AFTER the admin approves the team's application
 * (division_team_entries.entry_status = 'applied'). The captain
 * lands here from the TEAM_REGISTRATION_APPROVED notification or
 * the "Continue setup" CTA on /captain/register.
 *
 * If the entry is still pending_approval, applied was withdrawn /
 * rejected, or already past the wizard phase, surface a context-
 * specific message rather than the wizard.
 */
export default async function CaptainRegisterSetupPage({
  params
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;

  const scope = await iam.meScope().catch(() => null);
  const teamId = scope?.teamIds[0] ?? null;
  if (!teamId) {
    return (
      <EmptyState
        icon={Lock}
        title="No team in scope"
        description="You don't currently have a team to register."
      />
    );
  }

  const apps = await captain.myApplications(teamId).catch(() => ({ items: [] }));
  const entry = apps.items.find((a) => a.id === entryId);
  if (!entry) {
    return (
      <div className="space-y-6">
        <Link
          href="/captain/register"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" /> Back to applications
        </Link>
        <EmptyState
          icon={Lock}
          title="Application not found"
          description="This application doesn't belong to your team or no longer exists."
        />
      </div>
    );
  }

  if (entry.entryStatus === "pending_approval") {
    return (
      <div className="space-y-6">
        <Link
          href="/captain/register"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <PageHeader
          eyebrow="// captain console"
          title="Awaiting admin approval"
          description="The rollover wizard unlocks the moment your league admin approves the application."
        />
      </div>
    );
  }

  if (
    entry.entryStatus !== "applied" &&
    entry.entryStatus !== "accepted" &&
    entry.entryStatus !== "confirmed"
  ) {
    return (
      <div className="space-y-6">
        <Link
          href="/captain/register"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <EmptyState
          icon={Lock}
          title="Not editable"
          description={`This application is in status=${entry.entryStatus}.`}
        />
      </div>
    );
  }

  const [team, divisions] = await Promise.all([
    leagueMgmt.getTeam(teamId).catch(() => null),
    captain.listDivisions(entry.seasonId).catch(() => null)
  ]);
  if (!team || !divisions) {
    return (
      <EmptyState
        icon={Lock}
        title="Couldn't load setup data"
        description="Refresh and try again."
      />
    );
  }

  return (
    <RegisterWizard
      team={team}
      season={{
        id: entry.seasonId,
        name: entry.seasonName,
        registrationClosesAt: null
      }}
      league={{ id: "", name: entry.leagueName }}
      divisions={divisions.items}
      thresholdCents={team.confirmationThresholdCents ?? 0}
    />
  );
}
