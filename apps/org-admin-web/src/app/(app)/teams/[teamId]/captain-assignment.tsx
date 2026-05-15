"use client";

import { useState } from "react";
import { Loader2, Star, UserPlus, X } from "lucide-react";
import { Badge, Button, Eyebrow, Field, Input } from "@sportspulse/ui";
import { orgAdminTeams } from "@/lib/api/browser-api";

interface Captain {
  assignmentId: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  grantedAt: string | null;
}

export function CaptainAssignment({
  teamId,
  initialCaptains
}: {
  teamId: string;
  initialCaptains: Captain[];
}) {
  const [captains, setCaptains] = useState<Captain[]>(initialCaptains);
  const [showAssign, setShowAssign] = useState(false);
  const [userIdInput, setUserIdInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function refresh() {
    try {
      const next = await orgAdminTeams.detail(teamId);
      setCaptains(next.captains);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleAssign() {
    const userId = userIdInput.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      setError("Enter a valid user UUID");
      return;
    }
    setError(null);
    setBusy("assign");
    try {
      await orgAdminTeams.assignCaptain(teamId, { userId });
      setUserIdInput("");
      setShowAssign(false);
      setFlash("Captain assigned.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(assignmentId: string) {
    if (!confirm("Revoke this captain assignment?")) return;
    setError(null);
    setBusy(assignmentId);
    try {
      await orgAdminTeams.revokeCaptain(teamId, assignmentId);
      setFlash("Captain revoked.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <Eyebrow>// Captains</Eyebrow>
          <p className="mt-1 text-[13px] text-fg-muted">
            Captains manage the team roster, dues, lineups, and store. Org-admins can grant or revoke this role here without escalating to a super-admin.
          </p>
        </div>
        {!showAssign ? (
          <Button
            size="sm"
            onClick={() => {
              setShowAssign(true);
              setError(null);
              setFlash(null);
            }}
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" strokeWidth={2} />
            Assign captain
          </Button>
        ) : null}
      </header>

      {flash ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {flash}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {showAssign ? (
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>// Assign captain</Eyebrow>
            <button
              type="button"
              onClick={() => {
                setShowAssign(false);
                setUserIdInput("");
                setError(null);
              }}
              className="text-fg-muted hover:text-fg"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <Field
            label="User ID"
            hint="Paste the user UUID (find it on the user's profile in superadmin-web)."
          >
            <Input
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              disabled={busy === "assign"}
            />
          </Field>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAssign(false);
                setUserIdInput("");
                setError(null);
              }}
              disabled={busy === "assign"}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAssign}
              disabled={busy === "assign"}
            >
              {busy === "assign" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : null}
              Assign
            </Button>
          </div>
        </div>
      ) : null}

      {captains.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 px-5 py-6 text-[13px] text-fg-muted">
          No active captain yet. Assign one above so the team can manage their own roster.
        </div>
      ) : (
        <ul className="space-y-2">
          {captains.map((c) => (
            <li
              key={c.assignmentId}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                  <Star className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-fg">
                    {c.displayName ?? c.email ?? c.userId.slice(0, 8)}
                  </p>
                  <p className="truncate text-[11px] text-fg-muted">
                    {c.email ?? c.userId}
                  </p>
                </div>
                <Badge mono tone="success">
                  captain
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRevoke(c.assignmentId)}
                disabled={busy === c.assignmentId}
              >
                {busy === c.assignmentId ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" strokeWidth={2} />
                ) : null}
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
