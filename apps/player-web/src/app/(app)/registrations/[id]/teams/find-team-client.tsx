"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2, Send } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogActions
} from "@sportspulse/ui";
import { registration } from "@/lib/api/browser-api";

type Team = {
  id: string;
  name: string;
  shortName: string | null;
  sportCode: string;
  status: string;
  captainUserId: string | null;
  alreadyPending: boolean;
};

export function FindTeamClient({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<Team | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [appliedTeamIds, setAppliedTeamIds] = useState<Set<string>>(
    () => new Set(teams.filter((t) => t.alreadyPending).map((t) => t.id))
  );

  async function submit() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await registration.applyToTeam({
        teamId: target.id,
        message: message.trim() || undefined
      });
      setAppliedTeamIds((s) => new Set(s).add(target.id));
      setFlash(`Application sent to ${target.name}.`);
      setTarget(null);
      setMessage("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {flash && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => {
          const pending = appliedTeamIds.has(t.id);
          const initials = (t.shortName ?? t.name ?? "??")
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <li
              key={t.id}
              className="rounded-xl border border-border bg-surface-1 p-5"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[12px] font-semibold uppercase text-accent">
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold tracking-tight text-fg">
                    {t.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {t.sportCode}
                    {t.shortName ? ` · ${t.shortName}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={t.status === "active" ? "success" : "neutral"} mono>
                      {t.status}
                    </Badge>
                    {!t.captainUserId && (
                      <Badge tone="warning" mono>
                        no captain yet
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                {pending ? (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 font-mono text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-300">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Application pending
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setTarget(t)}
                    disabled={!t.captainUserId}
                    title={
                      !t.captainUserId
                        ? "Team has no captain yet — apply once one is assigned."
                        : undefined
                    }
                  >
                    <Send className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
                    Apply
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <ApplyDialog
        target={target}
        message={message}
        onMessage={setMessage}
        busy={busy}
        error={error}
        onClose={() => {
          setTarget(null);
          setError(null);
        }}
        onConfirm={submit}
      />
    </div>
  );
}

function ApplyDialog({
  target,
  message,
  onMessage,
  busy,
  error,
  onClose,
  onConfirm
}: {
  target: Team | null;
  message: string;
  onMessage: (v: string) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!target) return null;
  return (
    <Dialog
      open={true}
      onClose={onClose}
      title={`Apply to ${target.name}`}
      description="Send a join request to this team's captain. They'll see your name + email, your optional message below, then accept or decline."
    >
      <label className="block space-y-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Message (optional)
        </span>
        <textarea
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Anything the captain should know about you — position, level, availability."
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-fg focus:border-accent focus:outline-none"
        />
        <span className="block text-right text-[10px] text-fg-muted">
          {message.length}/500
        </span>
      </label>
      {error && (
        <p className="mt-2 rounded-md bg-rose-500/10 px-3 py-2 text-[13px] text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Check className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
              Send application
            </>
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
