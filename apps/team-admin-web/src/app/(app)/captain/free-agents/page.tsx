import { Star } from "lucide-react";
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
import type { FreeAgentPoolEntry } from "@sportspulse/api-client";
import { iam, leagueMgmt, registrationV2 } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { ClaimFreeAgentButton } from "./claim-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Free agents — SportsPulse" };

const LEVEL_COPY: Record<string, string> = {
  A: "Elite",
  B: "Competitive",
  C: "Recreational",
  D: "Beginner"
};

function fmtAvailability(av: Record<string, unknown>): string {
  const days = Object.keys(av).filter((k) => av[k]);
  if (days.length === 0) return "—";
  return days.slice(0, 3).join(", ");
}

export default async function CaptainFreeAgentsPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;

  if (!isCaptain) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Captain console" title="Free agents" />
        <EmptyState
          icon={Star}
          title="Captain role required"
          description="Ask your league admin to assign captain to your account."
        />
      </div>
    );
  }

  const myTeamId = scope!.teamIds[0] ?? null;
  if (!myTeamId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Captain console" title="Free agents" />
        <EmptyState
          icon={Star}
          title="No team in scope"
          description="Captains claim free agents for their own team. None is currently scoped to your account."
        />
      </div>
    );
  }

  const [team, raw] = await Promise.all([
    leagueMgmt.getTeam(myTeamId).catch(() => null),
    registrationV2
      .listFreeAgentPool({})
      .catch(() => [] as FreeAgentPoolEntry[])
  ]);

  const list: FreeAgentPoolEntry[] = Array.isArray(raw)
    ? raw
    : ((raw as unknown as { items?: FreeAgentPoolEntry[] }).items ?? []);
  const active = list.filter((e: FreeAgentPoolEntry) => e.status === "active");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Captain console"
        title="Free agents"
        description={`Players who registered as free agents and are looking for a team. Claim one to add them to ${team?.name ?? "your roster"}.`}
      />

      {active.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Pool is empty"
          description="No active free agents right now. Once players register without a team they'll show up here."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Player</TH>
              <TH>Positions</TH>
              <TH>Level</TH>
              <TH>Availability</TH>
              <TH>Note</TH>
              <TH className="text-right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {active.map((e: FreeAgentPoolEntry) => (
              <TR key={e.id}>
                <TD className="font-mono text-[11px] text-fg-muted">
                  {e.playerPersonId.slice(0, 8)}
                </TD>
                <TD>
                  {e.positions.map((p: string) => (
                    <Badge key={p} mono tone="info" className="mr-1">
                      {p}
                    </Badge>
                  ))}
                </TD>
                <TD>
                  <Badge mono tone="neutral">
                    {LEVEL_COPY[e.levelPrimary] ?? e.levelPrimary}
                  </Badge>
                  {e.levelFlexibility?.length ? (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                      ± {e.levelFlexibility.join(", ")}
                    </span>
                  ) : null}
                </TD>
                <TD className="text-[12px] text-fg-muted">
                  {fmtAvailability(e.availability)}
                </TD>
                <TD className="max-w-[18ch] truncate text-[12px] text-fg-muted">
                  {e.note ?? "—"}
                </TD>
                <TD className="text-right">
                  <ClaimFreeAgentButton entryId={e.id} teamId={myTeamId} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
