"use client";

import { useState } from "react";
import { ArrowRightLeft, Check, Loader2, X } from "lucide-react";
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
import type { TransferRequest } from "@sportspulse/api-client";
import { ROSTER_DROP_REASON_MIN_CHARS, TRANSFER_STATE_LABELS } from "@sportspulse/kernel";
import { captain } from "@/lib/api/browser-api";

const STATE_TONE: Record<TransferRequest["status"], "neutral" | "warning" | "success" | "danger"> = {
  pending_destination: "warning",
  pending_admin: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral"
};

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

/**
 * Transfers tab of the captain roster (CAP-25). Incoming: another captain
 * asked to move a player to this team; accept (a league admin approves
 * next) or decline with a reason. Outgoing: transfers this team started,
 * with their state; cancel while the other captain has not answered.
 */
export function TransfersPanel({
  incoming,
  outgoing,
  loading,
  onChanged,
  onFlash
}: {
  incoming: TransferRequest[];
  outgoing: TransferRequest[];
  loading: boolean;
  onChanged: () => Promise<void>;
  onFlash: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<unknown>, done: string) {
    setBusy(id);
    setError(null);
    try {
      await action();
      setDeclining(null);
      setReason("");
      onFlash(done);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading && incoming.length === 0 && outgoing.length === 0) {
    return <p className="px-1 py-6 text-sm text-fg-muted">Loading transfers…</p>;
  }
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        icon={ArrowRightLeft}
        title="No transfers"
        description="To move a player to another team, use Transfer on their row in the Active tab."
      />
    );
  }

  const name = (t: TransferRequest) => t.personName ?? "Unknown player";
  const tooShort = reason.trim().length < ROSTER_DROP_REASON_MIN_CHARS;

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-md bg-[var(--tint-rose-bg)] px-3 py-2 text-sm text-[var(--tint-rose-fg)]">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <Eyebrow>Incoming</Eyebrow>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {incoming.length} waiting for you
          </span>
        </header>
        {incoming.length === 0 ? (
          <p className="px-5 py-4 text-sm text-fg-muted">No other team has asked to move a player to yours.</p>
        ) : (
          <ul className="divide-y divide-border">
            {incoming.map((t) => (
              <li key={t.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-fg">
                      {name(t)} <span className="font-normal text-fg-muted">from {t.fromTeamName ?? "another team"}</span>
                    </p>
                    <p className="mt-0.5 text-[12px] text-fg-muted">
                      Asked {day(t.initiatedAt)}
                      {t.reason ? ` · Reason: ${t.reason}` : ""}
                    </p>
                  </div>
                  {declining === t.id ? null : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() =>
                          run(
                            t.id,
                            () => captain.roster.transfers.accept(t.id),
                            `Accepted ${name(t)}. A league admin approves the move; until then they stay on ${t.fromTeamName ?? "their team"}.`
                          )
                        }
                      >
                        {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-4 w-4" /> Accept</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => {
                          setDeclining(t.id);
                          setReason("");
                          setError(null);
                        }}
                      >
                        <X className="mr-1 h-4 w-4" /> Decline
                      </Button>
                    </div>
                  )}
                </div>
                {declining === t.id ? (
                  <div className="space-y-2 rounded-md border border-border bg-bg-subtle p-3">
                    <label className="grid gap-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                        Reason (required, min {ROSTER_DROP_REASON_MIN_CHARS} characters)
                      </span>
                      <textarea
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Our roster is full for this season."
                        className="w-full rounded-md border border-border bg-surface-1 p-2 text-sm text-fg focus:border-accent focus:outline-none"
                      />
                    </label>
                    <p className="text-[12px] text-fg-muted">The player and both captains get the reason.</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => {
                          setDeclining(null);
                          setReason("");
                        }}
                      >
                        Keep it
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy !== null || tooShort}
                        onClick={() =>
                          run(
                            t.id,
                            () => captain.roster.transfers.captainReject(t.id, reason.trim()),
                            `Declined. ${name(t)} stays on ${t.fromTeamName ?? "their team"}.`
                          )
                        }
                      >
                        {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decline transfer"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <Eyebrow>Started by your team</Eyebrow>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">{outgoing.length} total</span>
        </header>
        {outgoing.length === 0 ? (
          <p className="px-5 py-4 text-sm text-fg-muted">Your team has not started a transfer.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Player</TH>
                <TH>To</TH>
                <TH>State</TH>
                <TH>Started</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {outgoing.map((t) => (
                <TR key={t.id}>
                  <TD className="font-medium text-fg">{name(t)}</TD>
                  <TD>{t.toTeamName ?? "Another team"}</TD>
                  <TD>
                    <Badge mono tone={STATE_TONE[t.status]}>
                      {TRANSFER_STATE_LABELS[t.status]}
                    </Badge>
                    {t.status === "rejected" && t.rejectionReason ? (
                      <p className="mt-1 text-[12px] text-fg-muted">Reason: {t.rejectionReason}</p>
                    ) : null}
                  </TD>
                  <TD className="text-[12px] text-fg-muted">{day(t.initiatedAt)}</TD>
                  <TD className="text-right">
                    {t.status === "pending_destination" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() =>
                          run(
                            t.id,
                            () => captain.roster.transfers.cancel(t.id),
                            `Cancelled the transfer of ${name(t)}.`
                          )
                        }
                      >
                        {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel"}
                      </Button>
                    ) : null}
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
