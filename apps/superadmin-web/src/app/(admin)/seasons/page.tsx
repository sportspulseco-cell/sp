import { CalendarRange, Wand2, Trophy, CircleDot, Archive } from "lucide-react";
import Link from "next/link";
import { leagueMgmt } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { KineticStrip } from "@/components/layout/kinetic-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, statusTone } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { AssignAdminCell } from "@/components/roles/assign-admin-cell";

export const metadata = { title: "Seasons — SportsPulse" };

/**
 * View-only listing — creation lives exclusively in /org-setup so the
 * 4-phase wizard stays the single source of truth (per repo owner
 * directive, 2026-05-09). Click a row → /seasons/[id] for full info.
 */
export default async function SeasonsPage({
  searchParams
}: {
  searchParams?: Promise<{ leagueId?: string }>;
}) {
  const sp = await searchParams;
  const [seasonsPage, leaguesPage] = await Promise.all([
    leagueMgmt.listSeasons({ leagueId: sp?.leagueId }).catch(() => ({ items: [] })),
    leagueMgmt.listLeagues().catch(() => ({ items: [] }))
  ]);
  const leagueMap = new Map(leaguesPage.items.map((l) => [l.id, l.name]));

  const orgSetupCta = (
    <Link
      href="/org-setup"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg hover:border-fg-muted"
    >
      <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      New season → Org setup
    </Link>
  );

  const inProgress = seasonsPage.items.filter(
    (s) => s.status === "in_progress" || s.status === "playoffs"
  ).length;
  const open = seasonsPage.items.filter(
    (s) => s.status === "registration_open"
  ).length;
  const drafts = seasonsPage.items.filter((s) => s.status === "draft").length;
  const archived = seasonsPage.items.filter(
    (s) => s.status === "archived" || s.status === "completed"
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="lifecycle"
        title="Seasons"
        description={
          sp?.leagueId
            ? `Filtered by league ${leagueMap.get(sp.leagueId) ?? sp.leagueId.slice(0, 8)}`
            : "Time-bounded instances of a league. Click a row to inspect; create new seasons via Org setup."
        }
        action={orgSetupCta}
      />
      <KineticStrip
        cards={[
          {
            label: "In progress",
            value: inProgress,
            icon: CircleDot,
            tone: inProgress > 0 ? "ok" : "idle"
          },
          {
            label: "Registration open",
            value: open,
            icon: Trophy,
            tone: open > 0 ? "info" : "idle"
          },
          {
            label: "Drafts",
            value: drafts,
            icon: CalendarRange,
            tone: drafts > 0 ? "warn" : "idle"
          },
          {
            label: "Archived / done",
            value: archived,
            icon: Archive,
            tone: "idle"
          }
        ]}
      />

      {seasonsPage.items.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No seasons yet"
          description="New seasons are created via the 4-phase Org setup wizard."
          action={orgSetupCta}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>League</TH>
              <TH>Sport</TH>
              <TH>Window</TH>
              <TH>Timezone</TH>
              <TH>Status</TH>
              <TH>Admins</TH>
            </TR>
          </THead>
          <TBody>
            {seasonsPage.items.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">
                  <Link
                    href={`/seasons/${s.id}`}
                    className="hover:underline"
                  >
                    {s.name}
                  </Link>
                </TD>
                <TD className="text-muted-foreground">
                  {leagueMap.get(s.leagueId) ?? s.leagueId.slice(0, 8)}
                </TD>
                <TD className="text-muted-foreground">{s.sportCode}</TD>
                <TD className="text-muted-foreground">
                  {s.startDate} → {s.endDate}
                </TD>
                <TD className="text-muted-foreground">{s.timezone}</TD>
                <TD>
                  <Badge tone={statusTone(s.status)}>
                    {s.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD>
                  <AssignAdminCell
                    scopeType="season"
                    scopeId={s.id}
                    resourceLabel={s.name}
                    allowedRoleCodes={["season_admin", "registrar"]}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
