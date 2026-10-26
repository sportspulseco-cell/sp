import Link from "next/link";
import { Star } from "lucide-react";
import { EmptyState, PageHeader } from "@sportspulse/ui";
import { iam, loadMeScope, leagueMgmt } from "@/lib/api/server-api";
import { TeamMessageForm } from "./message-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Message the team · Team Admin" };

const STAFF_ROLES = ["captain", "coach"];

/**
 * Team message (UC-20, MON-12, FR-3.17.2): captains and coaches write to
 * the roster, captains and coaches by email and in the app. Someone who
 * runs two teams picks the team; the default is `?teamId=` when given,
 * else the team the rest of this app shows (the first team in scope),
 * else their first staffed team. The API checks the caller captains or
 * coaches the team.
 */
export default async function CommsPage({
  searchParams
}: {
  searchParams?: Promise<{ teamId?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const [scope, roles] = await Promise.all([
    loadMeScope(),
    iam.myActiveRoles().catch(() => [])
  ]);
  const staffed = Array.from(
    new Set(
      roles
        .filter((r) => r.scopeType === "team" && r.scopeId && STAFF_ROLES.includes(r.role?.code ?? ""))
        .map((r) => r.scopeId as string)
    )
  );
  if (staffed.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Your team" title="Message the team" description="Captains and coaches write to their team here." />
        <EmptyState
          icon={Star}
          title="Captain or coach role required"
          description="Ask your league admin to make you the team's captain or coach."
        />
      </div>
    );
  }
  const primary = scope?.teamIds[0] ?? null;
  const teamId =
    sp.teamId && staffed.includes(sp.teamId)
      ? sp.teamId
      : primary && staffed.includes(primary)
        ? primary
        : staffed[0]!;
  const teams = await Promise.all(
    staffed.map(async (id) => ({ id, name: (await leagueMgmt.getTeam(id).catch(() => null))?.name ?? "Team" }))
  );
  teams.sort((a, b) => a.name.localeCompare(b.name));
  const teamName = teams.find((t) => t.id === teamId)?.name ?? "Your team";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your team"
        title="Message the team"
        description={`Write to ${teamName}'s players, captains and coaches. They get it by email, in the app, or both.`}
      />
      {teams.length > 1 ? (
        <nav aria-label="Team to write to" className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-fg-muted">Team:</span>
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/comms?teamId=${t.id}`}
              aria-current={t.id === teamId ? "page" : undefined}
              className={
                "rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors " +
                (t.id === teamId
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-border text-fg-muted hover:border-border-strong hover:text-fg")
              }
            >
              {t.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <TeamMessageForm key={teamId} teamId={teamId} teamName={teamName} />
    </div>
  );
}
