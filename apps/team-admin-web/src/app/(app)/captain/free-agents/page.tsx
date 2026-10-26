import { Star } from "lucide-react";
import { Badge, EmptyState, LoadError, LocalDate, Table, TBody, TD, TH, THead, TR } from "@sportspulse/ui";
import { load } from "@sportspulse/api-client";
import type { FreeAgentOffer, FreeAgentPoolEntry } from "@sportspulse/api-client";
import {
  FREE_AGENT_OFFER_STATUS_LABELS,
  formatFreeAgentAvailability,
  freeAgentLevelLabel,
  freeAgentPositionLabel
} from "@sportspulse/kernel";
import { leagueMgmt, loadMeScope, registrationV2 } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { ClaimFreeAgentButton } from "./claim-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Free agents — SportsPulse" };

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function fmtDay(iso: string | null) {
  return <LocalDate iso={iso} format="monthDay" fallback="—" />;
}

export default async function CaptainFreeAgentsPage() {
  const scope = await loadMeScope();
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;

  if (!isCaptain) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Captain console" title="Free agents" />
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
        <PageHeader eyebrow="Captain console" title="Free agents" />
        <EmptyState
          icon={Star}
          title="No team in scope"
          description="Captains offer free agents a spot on their own team. None is currently scoped to your account."
        />
      </div>
    );
  }

  // forTeamId: the server resolves every season the team is live in and
  // returns only those pools, each entry with this team's latest offer.
  const [team, pool, offersResult] = await Promise.all([
    leagueMgmt.getTeam(myTeamId).catch(() => null),
    load(registrationV2.listFreeAgentPool({ forTeamId: myTeamId })),
    load(registrationV2.listFreeAgentOffers({ teamId: myTeamId }))
  ]);

  const poolRows = pool.ok ? pool.data : [];
  const list: FreeAgentPoolEntry[] = Array.isArray(poolRows)
    ? poolRows
    : ((poolRows as unknown as { items?: FreeAgentPoolEntry[] }).items ?? []);
  const active = list.filter((e: FreeAgentPoolEntry) => e.status === "active");
  const teamName = team?.name ?? "your team";
  const offers = offersResult.ok ? offersResult.data : [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Captain console"
        title="Free agents"
        description={`Players looking for a team. Offer one a spot on ${teamName}: they get an email, accept or decline, and join your roster when they accept.`}
      />

      {!pool.ok ? (
        <LoadError what="the free-agent pool" status={pool.status} message={pool.message} />
      ) : active.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Pool is empty"
          description="No free agents are looking for a team in your seasons right now. Players who list themselves as free agents show up here."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Player</TH>
              <TH>Age</TH>
              <TH>Positions</TH>
              <TH>Level</TH>
              <TH>Availability</TH>
              <TH>Note</TH>
              <TH className="text-right">Offer</TH>
            </TR>
          </THead>
          <TBody>
            {active.map((e: FreeAgentPoolEntry) => {
              const age = ageFromDob(e.playerDob);
              return (
                <TR key={e.id}>
                  <TD>
                    <div className="font-medium text-fg">{e.playerName ?? "—"}</div>
                    {e.playerEmail ? (
                      <div className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        {e.playerEmail}
                      </div>
                    ) : null}
                    {e.seasonName ? (
                      <div className="text-[11px] text-fg-muted">{e.seasonName}</div>
                    ) : null}
                  </TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {age != null ? `${age}` : "—"}
                  </TD>
                  <TD>
                    {e.positions.map((p: string) => (
                      <Badge key={p} mono tone="info" className="mr-1">
                        {freeAgentPositionLabel(p)}
                      </Badge>
                    ))}
                  </TD>
                  <TD>
                    <Badge mono tone="neutral">
                      {freeAgentLevelLabel(e.levelPrimary)}
                    </Badge>
                    {e.levelFlexibility?.length ? (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        ± {e.levelFlexibility.join(", ")}
                      </span>
                    ) : null}
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {formatFreeAgentAvailability(e.availability)}
                  </TD>
                  <TD className="max-w-[18ch] truncate text-[12px] text-fg-muted">
                    {e.note ?? "—"}
                  </TD>
                  <TD className="text-right">
                    <ClaimFreeAgentButton
                      key={`${e.id}:${e.teamOffer?.id ?? "none"}:${e.teamOffer?.status ?? ""}`}
                      entryId={e.id}
                      teamId={myTeamId}
                      teamName={teamName}
                      playerName={e.playerName ?? "this player"}
                      seasonName={e.seasonName ?? null}
                      initialOffer={e.teamOffer ?? null}
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight text-fg">Your offers</h2>
          <p className="text-[12px] text-fg-muted">
            What happened to each offer {teamName} made. Accepted players are on your roster.
          </p>
        </div>
        {!offersResult.ok ? (
          <LoadError what="your offers" status={offersResult.status} message={offersResult.message} />
        ) : offers.length === 0 ? (
          <EmptyState
            icon={Star}
            title="No offers yet"
            description="Offers you send to free agents show up here with their answer."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Player</TH>
                <TH>Season</TH>
                <TH>State</TH>
                <TH>Sent</TH>
                <TH>Expires / answered</TH>
              </TR>
            </THead>
            <TBody>
              {offers.map((o) => (
                <TR key={o.id}>
                  <TD className="font-medium text-fg">{o.playerName ?? "—"}</TD>
                  <TD className="text-[12px] text-fg-muted">{o.seasonName ?? "—"}</TD>
                  <TD>
                    <Badge status={o.status}>
                      {FREE_AGENT_OFFER_STATUS_LABELS[o.status]}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-[11px] text-fg-muted">{fmtDay(o.createdAt)}</TD>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {o.status === "pending" ? fmtDay(o.expiresAt) : fmtDay(o.decidedAt ?? o.expiresAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
