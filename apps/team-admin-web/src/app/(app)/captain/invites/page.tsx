import { Mail, Star } from "lucide-react";
import {
  Badge,
  EmptyState,
  Eyebrow,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import type { TeamInvite } from "@sportspulse/api-client";
import { iam, leagueMgmt, registrationV2 } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { CreateInviteForm } from "./create-invite-form";
import { RevokeInviteButton } from "./revoke-invite-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Invites — SportsPulse" };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

const STATUS_TONE: Record<
  TeamInvite["status"],
  "info" | "success" | "danger" | "warning" | "neutral"
> = {
  pending: "warning",
  accepted: "success",
  declined: "danger",
  expired: "neutral",
  revoked: "neutral"
};

export default async function CaptainInvitesPage() {
  const scope = await iam.meScope().catch(() => null);
  const isCaptain = scope?.roleCodes.includes("captain") ?? false;

  if (!isCaptain) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="// Captain console" title="Invites" />
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
        <PageHeader eyebrow="// Captain console" title="Invites" />
        <EmptyState
          icon={Mail}
          title="No team in scope"
          description="Captains issue invites for their own team. None is currently scoped to your account."
        />
      </div>
    );
  }

  const [team, invitesRaw] = await Promise.all([
    leagueMgmt.getTeam(myTeamId).catch(() => null),
    registrationV2
      .listTeamInvites({ teamId: myTeamId })
      .catch(() => [] as TeamInvite[])
  ]);
  // Some endpoints have shipped both shapes ({ items } page vs raw array).
  // Normalise so this page works against either.
  const invites: TeamInvite[] = Array.isArray(invitesRaw)
    ? invitesRaw
    : ((invitesRaw as unknown as { items?: TeamInvite[] }).items ?? []);

  const pending = invites.filter((i: TeamInvite) => i.status === "pending");
  const past = invites.filter((i: TeamInvite) => i.status !== "pending");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Captain console"
        title="Invites"
        description={`Issue + revoke invites for ${team?.name ?? "your team"}. Personal invites expire in 7 days; generic team URLs last until roster lock.`}
      />

      <section className="rounded-xl border border-border bg-surface-1 p-6">
        <Eyebrow>// New invite</Eyebrow>
        <p className="mt-1 text-[12px] text-fg-muted">
          Email a personal invite or generate a shareable team URL.
        </p>
        <div className="mt-4">
          <CreateInviteForm teamId={myTeamId} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <Eyebrow>// Pending invites</Eyebrow>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {pending.length} active
          </span>
        </header>
        {pending.length === 0 ? (
          <div className="px-5 py-6 text-[13px] text-fg-muted">
            No pending invites.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Recipient</TH>
                <TH>Kind</TH>
                <TH>Sent</TH>
                <TH>Expires</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {pending.map((inv: TeamInvite) => (
                <TR key={inv.id}>
                  <TD>
                    {inv.inviteeEmail ?? (
                      <span className="font-mono text-[11px] text-fg-muted">
                        Generic URL
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Badge mono tone="info">
                      {inv.kind}
                    </Badge>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {fmtDate(inv.createdAt)}
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {fmtDate(inv.expiresAt)}
                  </TD>
                  <TD className="text-right">
                    <RevokeInviteButton inviteId={inv.id} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {past.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface-1">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <Eyebrow>// Closed invites</Eyebrow>
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              {past.length}
            </span>
          </header>
          <Table>
            <THead>
              <TR>
                <TH>Recipient</TH>
                <TH>Status</TH>
                <TH>Sent</TH>
                <TH>Closed</TH>
              </TR>
            </THead>
            <TBody>
              {past.map((inv: TeamInvite) => (
                <TR key={inv.id}>
                  <TD>
                    {inv.inviteeEmail ?? (
                      <span className="font-mono text-[11px] text-fg-muted">
                        Generic URL
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Badge mono tone={STATUS_TONE[inv.status]}>
                      {inv.status}
                    </Badge>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {fmtDate(inv.createdAt)}
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {fmtDate(inv.acceptedAt ?? inv.revokedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
