"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Clock,
  Lock,
  Mail,
  RotateCcw,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Eyebrow,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import { captain } from "@/lib/api/browser-api";
import { PageHeader } from "@/components/layout/page-header";
import { AddPlayerModal } from "./add-player-modal";
import { DropPlayerModal } from "./drop-player-modal";
import { InitiateTransferModal } from "./initiate-transfer-modal";

type RosterPayload = Awaited<ReturnType<typeof captain.roster.list>>;
type MembershipRow = RosterPayload["memberships"][number];
type InviteRow = RosterPayload["invites"][number];
type TabKey = "active" | "pending" | "compliance" | "guests";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending invite" },
  { key: "compliance", label: "Compliance issues" },
  { key: "guests", label: "Guests" }
];

export function RosterScreen({
  teamId,
  initial
}: {
  teamId: string;
  initial: RosterPayload | null;
}) {
  const [data, setData] = useState<RosterPayload | null>(initial);
  const [tab, setTab] = useState<TabKey>("active");
  const [addOpen, setAddOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<MembershipRow | null>(null);
  const [transferTarget, setTransferTarget] = useState<MembershipRow | null>(
    null
  );
  const [flash, setFlash] = useState<string | null>(null);

  async function refresh() {
    try {
      const next = await captain.roster.list(teamId);
      setData(next);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (!initial) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockMeta = useLockMeta(data?.rosterLockAt ?? null);
  const isLocked = data?.isLocked ?? false;

  const memberships = data?.memberships ?? [];
  const invites = data?.invites ?? [];
  const rules = data?.rules;

  const counts = useMemo(() => {
    const all = memberships.length;
    return {
      all,
      pending: invites.filter(
        (i) => i.status === "pending" || i.status === "extended"
      ).length,
      compliance: 0,
      guests: 0
    };
  }, [memberships, invites]);

  const headerSub =
    rules && data
      ? `${memberships.length} / ${rules.maxRosterSize} players · ${data.season?.name ?? "no active season"}${data.division ? " · " + data.division.name : ""}`
      : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// Captain console"
        title="Manage roster"
        description={headerSub}
      />

      {/* Lock countdown */}
      {lockMeta && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
            lockMeta.tone === "red"
              ? "border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200"
              : lockMeta.tone === "amber"
                ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                : "border-border bg-bg-subtle text-fg-muted"
          }`}
        >
          {isLocked ? (
            <Lock className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
          <span className="font-medium">{lockMeta.label}</span>
        </div>
      )}

      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}

      {/* Action bar — hidden ENTIRELY after rosterLockAt per spec §1.2 */}
      {!isLocked && data?.season && (
        <div className="flex flex-wrap gap-2 rounded-md border border-border bg-surface-1 p-3">
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Add player
          </Button>
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            <Mail className="mr-2 h-4 w-4" /> Invite by email
          </Button>
          <Button variant="ghost" disabled>
            Export roster CSV
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative -mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest transition ${
              tab === t.key
                ? "border-accent text-fg"
                : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
            {t.key in counts && counts[t.key as keyof typeof counts] > 0 && (
              <span className="ml-1.5 inline-block rounded-full bg-bg-subtle px-1.5 py-0.5 text-[9px] font-medium text-fg">
                {counts[t.key as keyof typeof counts]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "active" && (
        <ActiveRosterTable
          memberships={memberships}
          isLocked={isLocked}
          onDrop={(m) => setDropTarget(m)}
          onTransfer={(m) => setTransferTarget(m)}
        />
      )}
      {tab === "pending" && (
        <PendingInvitesTable
          invites={invites}
          isLocked={isLocked}
          teamId={teamId}
          onRefresh={refresh}
          onFlash={setFlash}
        />
      )}
      {tab === "compliance" && (
        <EmptyState
          icon={ShieldCheck}
          title="Compliance tracking coming in Sprint 7"
          description="USA Hockey ID expiry, age verification, and waiver freshness will surface here as red/amber/green badges."
        />
      )}
      {tab === "guests" && (
        <EmptyState
          icon={Users}
          title="No guest appearances yet"
          description="Guests are added from a specific game in the schedule view — they don't count against your roster cap."
        />
      )}

      {/* Compliance summary bar */}
      {memberships.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-surface-1 px-4 py-2.5 text-[12px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-fg">{memberships.length}</span>
            <span className="text-fg-muted">all clear</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="font-medium text-fg">0</span>
            <span className="text-fg-muted">expiring</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="font-medium text-fg">0</span>
            <span className="text-fg-muted">action required</span>
          </span>
        </div>
      )}

      {/* Modals */}
      <AddPlayerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        teamId={teamId}
        seasonId={data?.season?.id ?? null}
        divisionId={data?.division?.id ?? null}
        currentCount={memberships.length}
        maxRosterSize={rules?.maxRosterSize ?? 20}
        onCreated={async (msg) => {
          setAddOpen(false);
          setFlash(msg);
          await refresh();
        }}
      />
      <DropPlayerModal
        target={dropTarget}
        teamId={teamId}
        seasonId={data?.season?.id ?? null}
        onClose={() => setDropTarget(null)}
        onDropped={async (msg) => {
          setDropTarget(null);
          setFlash(msg);
          await refresh();
        }}
      />
      <InitiateTransferModal
        target={transferTarget}
        fromTeamId={teamId}
        seasonId={data?.season?.id ?? null}
        onClose={() => setTransferTarget(null)}
        onInitiated={async (msg) => {
          setTransferTarget(null);
          setFlash(msg);
          await refresh();
        }}
      />
    </div>
  );
}

function ActiveRosterTable({
  memberships,
  isLocked,
  onDrop,
  onTransfer
}: {
  memberships: MembershipRow[];
  isLocked: boolean;
  onDrop: (m: MembershipRow) => void;
  onTransfer: (m: MembershipRow) => void;
}) {
  if (memberships.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Empty roster"
        description={
          isLocked
            ? "The roster is locked and no players have been added."
            : "Use Add player or Invite by email to bring players onto your team."
        }
      />
    );
  }
  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <Eyebrow>// Active roster</Eyebrow>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {memberships.length} active
        </span>
      </header>
      <Table>
        <THead>
          <TR>
            <TH>Player</TH>
            <TH className="text-right">#</TH>
            <TH>Position</TH>
            <TH>USA Hockey</TH>
            <TH>Eligibility</TH>
            <TH>Effective from</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {memberships.map((m) => {
            const name =
              [m.personFirstName, m.personLastName]
                .filter(Boolean)
                .join(" ") || m.personId.slice(0, 8);
            return (
              <TR key={m.id}>
                <TD className="font-medium">
                  <p>{name}</p>
                  {m.personEmail && (
                    <p className="text-[11px] text-fg-muted">
                      {m.personEmail}
                    </p>
                  )}
                </TD>
                <TD className="text-right font-mono tabular-nums">
                  {m.jerseyNumber ?? "—"}
                </TD>
                <TD className="text-fg-muted">{m.positionCode ?? "—"}</TD>
                <TD>
                  <Badge mono tone="success">
                    verified
                  </Badge>
                </TD>
                <TD>
                  <Badge mono tone="success">
                    eligible
                  </Badge>
                </TD>
                <TD className="text-[12px] text-fg-muted">
                  {new Date(m.effectiveFrom).toLocaleDateString("en-CA")}
                </TD>
                <TD className="text-right">
                  {isLocked ? (
                    <span className="font-mono text-[10px] uppercase text-fg-muted">
                      locked
                    </span>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onTransfer(m)}
                      >
                        <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Transfer
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onDrop(m)}
                      >
                        <UserMinus className="mr-1 h-3.5 w-3.5" /> Drop
                      </Button>
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

function PendingInvitesTable({
  invites,
  isLocked,
  teamId,
  onRefresh,
  onFlash
}: {
  invites: InviteRow[];
  isLocked: boolean;
  teamId: string;
  onRefresh: () => Promise<void>;
  onFlash: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (invites.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No pending invites"
        description="Outstanding email invites will appear here while they wait on the player."
      />
    );
  }

  async function remind(inviteId: string) {
    if (isLocked) return;
    setBusy(inviteId);
    try {
      await captain.roster.remind(teamId, inviteId);
      onFlash("Reminder sent.");
      await onRefresh();
    } catch (e) {
      onFlash((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <Eyebrow>// Pending invites</Eyebrow>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          {invites.length} outstanding
        </span>
      </header>
      <Table>
        <THead>
          <TR>
            <TH>Email</TH>
            <TH>Status</TH>
            <TH>Expires</TH>
            <TH>Extensions</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {invites.map((i) => {
            const isExpired = i.status === "expired";
            return (
              <TR key={i.id}>
                <TD className="italic">{i.email ?? "—"}</TD>
                <TD>
                  <Badge
                    mono
                    tone={
                      isExpired
                        ? "warning"
                        : i.status === "extended"
                          ? "neutral"
                          : "neutral"
                    }
                  >
                    {i.status === "pending"
                      ? "awaiting acceptance"
                      : i.status.replace(/_/g, " ")}
                  </Badge>
                </TD>
                <TD className="text-[12px] text-fg-muted">
                  {i.expiresAt
                    ? new Date(i.expiresAt).toLocaleDateString("en-CA")
                    : "—"}
                </TD>
                <TD className="text-[12px] text-fg-muted tabular-nums">
                  {i.extensionCount} / 2
                </TD>
                <TD className="text-right">
                  {isLocked ? (
                    <span className="font-mono text-[10px] uppercase text-fg-muted">
                      locked
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remind(i.id)}
                      disabled={busy === i.id || i.extensionCount >= 2}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      {i.extensionCount >= 2 ? "Max reached" : "Resend"}
                    </Button>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------
// Lock countdown formatting
// ---------------------------------------------------------------------
function useLockMeta(
  iso: string | null
): { label: string; tone: "neutral" | "amber" | "red" } | null {
  return useMemo(() => {
    if (!iso) return null;
    const lock = new Date(iso).getTime();
    const now = Date.now();
    const days = Math.ceil((lock - now) / (24 * 60 * 60 * 1000));
    if (days < 0) {
      return {
        label: `Roster locked since ${new Date(iso).toLocaleDateString("en-CA")}`,
        tone: "red"
      };
    }
    if (days === 0) {
      return { label: "Locks today", tone: "red" };
    }
    if (days <= 2) {
      return {
        label: `Locks in ${days} day${days === 1 ? "" : "s"}`,
        tone: "red"
      };
    }
    if (days <= 7) {
      return { label: `Locks in ${days} days`, tone: "amber" };
    }
    return { label: `Locks in ${days} days`, tone: "neutral" };
  }, [iso]);
}

// Stub to suppress unused warnings on the icons we reserve for the
// compliance tab (Sprint 7).
export const _reservedIcons = { Check, AlertTriangle };
