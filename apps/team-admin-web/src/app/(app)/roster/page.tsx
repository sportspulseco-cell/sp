import { fetchAll } from "@sportspulse/api-client";
import { Users } from "lucide-react";
import {
  Badge,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  SeasonSwitch
} from "@sportspulse/ui";
import type { TeamMembership } from "@sportspulse/api-client";
import { pickRosterSeason, seasonCurrency } from "@sportspulse/kernel";
import { iam, leagueMgmt, roster } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roster - Team Admin" };

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

export default async function TeamAdminRosterPage({
  searchParams
}: {
  searchParams?: Promise<{ season?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const scope = await iam.meScope().catch(() => null);
  const teamId = scope?.teamIds[0] ?? null;

  if (!teamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Roster" title="Roster" />
        <EmptyState icon={Users} title="No team in scope" description="You need a captain or coach role on a team to see its roster." />
      </div>
    );
  }

  const [team, live] = await Promise.all([
    leagueMgmt.getTeam(teamId).catch(() => null),
    leagueMgmt.teamSeasons(teamId).catch(() => [])
  ]);
  // Every page of memberships: the team has dozens across seasons and the
  // first page alone missed newly added players (J8).
  const allPage = await fetchAll((cursor) =>
    roster.listMemberships({ teamId, activeOnly: true, limit: 100, cursor })
  ).catch(() => ({ items: [] as TeamMembership[], nextCursor: null }));
  // One season's roster (CAP-19): the current season unless another is picked.
  // Same season rule as the captain roster (team's live seasons).
  const seasonRows: Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    registrationOpensAt: string | null;
    registrationClosesAt: string | null;
  }> =
    live.length > 0
      ? live
      : (
          await Promise.all(
            Array.from(new Set(allPage.items.map((m: TeamMembership) => m.seasonId))).map((id) =>
              leagueMgmt.getSeason(id).catch(() => null)
            )
          )
        ).filter((s): s is NonNullable<typeof s> => !!s);
  const selectedSeason =
    seasonRows.find((s) => s.id === sp.season) ?? (live.length > 0 ? live[0]! : pickRosterSeason(seasonRows, sp.season));
  const page = {
    ...allPage,
    items: selectedSeason
      ? allPage.items.filter((m: TeamMembership) => m.seasonId === selectedSeason.id)
      : allPage.items
  };
  const seasonOptions = seasonRows.map((s) => ({
    id: s.id,
    name: s.name,
    current: seasonCurrency(s) === "in_progress"
  }));

  // Resolve person rows so we render real names instead of 8-char id
  // prefixes. Roster memberships carry only person_id; the persons
  // endpoint is JwtAuthGuard'd so any signed-in user can fetch.
  const personIds = Array.from(new Set(page.items.map((m: TeamMembership) => m.personId)));
  const personEntries = await Promise.all(
    personIds.map(async (id) => {
      const p = await iam.getPerson(id).catch(() => null);
      return [id, p] as const;
    })
  );
  const personById = new Map(personEntries);

  function nameFor(personId: string): string {
    const p = personById.get(personId);
    if (!p) return "Unknown player";
    return (
      p.preferredName ||
      [p.legalFirstName, p.legalLastName].filter(Boolean).join(" ") ||
      "Unknown player"
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Roster"
        title={team ? `${team.name} - Roster` : "Roster"}
        description={`${page.items.length} active ${page.items.length === 1 ? "player" : "players"}${selectedSeason ? ` in ${selectedSeason.name}` : ""}.`}
      />
      <SeasonSwitch seasons={seasonOptions} selectedId={selectedSeason?.id ?? null} />
      {page.items.length === 0 ? (
        <EmptyState icon={Users} title="Empty roster" description="Add players from the captain console or super-admin." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Player</TH>
              <TH>Age</TH>
              <TH className="text-right">#</TH>
              <TH>Position</TH>
              <TH>Type</TH>
              <TH>Effective from</TH>
            </TR>
          </THead>
          <TBody>
            {page.items.map((m: TeamMembership) => {
              const p = personById.get(m.personId);
              const age = ageFromDob(p?.dobDate ?? null);
              return (
                <TR key={m.id}>
                  <TD>
                    <div className="font-medium text-fg">{nameFor(m.personId)}</div>
                  </TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {age != null ? age : "—"}
                  </TD>
                  <TD className="text-right font-mono tabular-nums">{m.jerseyNumber ?? "-"}</TD>
                  <TD className="text-fg-muted">{m.positionCode ?? "-"}</TD>
                  <TD><Badge mono tone="neutral">{m.membershipType}</Badge></TD>
                  <TD className="text-[12px] text-fg-muted">{new Date(m.effectiveFrom).toLocaleDateString("en-CA")}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
