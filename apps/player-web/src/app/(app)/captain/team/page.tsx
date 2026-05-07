import { Settings, Star } from "lucide-react";
import { EmptyState, Eyebrow } from "@sportspulse/ui";
import { iam, leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { TeamProfileForm } from "./team-profile-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Manage team — SportsPulse" };

export default async function CaptainTeamPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;

  if (!isCaptain) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Captain console"
          title="Manage team"
        />
        <EmptyState
          icon={Star}
          title="Captain role required"
          description="This page is for rostered players who hold the captain role on a team. Ask your league admin to assign captain to your account."
        />
      </div>
    );
  }

  const myTeamId = scope!.teamIds[0] ?? null;
  const team = myTeamId
    ? await leagueMgmt.getTeam(myTeamId).catch(() => null)
    : null;

  if (!team) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="// Captain console"
          title="Manage team"
        />
        <EmptyState
          icon={Settings}
          title="No team in scope"
          description="You hold the captain role but no team is currently scoped to your account. Contact your league admin."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Captain console"
        title="Manage team"
        description="Edit your team's display profile. Roster + invites + free-agents have their own pages."
      />
      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <Eyebrow>// {team.name}</Eyebrow>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-fg-muted">
          {team.sportCode} · {team.id.slice(0, 8)}
        </p>
        <div className="mt-6">
          <TeamProfileForm
            teamId={team.id}
            initial={{
              name: team.name,
              shortName: team.shortName ?? ""
            }}
          />
        </div>
      </section>
    </div>
  );
}
