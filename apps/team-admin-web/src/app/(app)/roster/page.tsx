import { Users } from "lucide-react";
import {
  Badge,
  EmptyState,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import type { TeamMembership } from "@sportspulse/api-client";
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

export default async function TeamAdminRosterPage() {
  const scope = await iam.meScope().catch(() => null);
  const teamId = scope?.teamIds[0] ?? null;

  if (!teamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Roster" title="Roster" />
        <EmptyState icon={Users} title="No team in scope" description="You need a team_admin or coach role on a team to see its roster." />
      </div>
    );
  }

  const [team, page] = await Promise.all([
    leagueMgmt.getTeam(teamId).catch(() => null),
    roster.listMemberships({ teamId, activeOnly: true }).catch(() => ({ items: [], nextCursor: null }))
  ]);

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
    if (!p) return personId.slice(0, 8).toUpperCase();
    return (
      p.preferredName ||
      [p.legalFirstName, p.legalLastName].filter(Boolean).join(" ") ||
      personId.slice(0, 8).toUpperCase()
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Roster"
        title={team ? `${team.name} - Roster` : "Roster"}
        description={`${page.items.length} active membership${page.items.length === 1 ? "" : "s"}.`}
      />
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
