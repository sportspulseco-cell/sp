"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Star, UserPlus, X } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Eyebrow,
  Field,
  Input
} from "@sportspulse/ui";
import { orgAdminPersons, orgAdminTeams } from "@/lib/api/browser-api";

interface Captain {
  assignmentId: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  grantedAt: string | null;
}

interface Candidate {
  id: string;
  userId: string;
  displayName: string;
  email: string | null;
}

export function CaptainAssignment({
  teamId,
  orgId,
  initialCaptains
}: {
  teamId: string;
  orgId: string;
  initialCaptains: Captain[];
}) {
  const [captains, setCaptains] = useState<Captain[]>(initialCaptains);
  const [showAssign, setShowAssign] = useState(false);
  const [mode, setMode] = useState<"pick" | "invite">("pick");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [people, setPeople] = useState<Candidate[] | null>(null);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!showAssign || people !== null) return;
    let cancelled = false;
    setLoadingPeople(true);
    orgAdminPersons
      .list({ orgId })
      .then((rows) => {
        if (cancelled) return;
        const assignable: Candidate[] = rows
          .filter((r): r is typeof r & { userId: string } => !!r.userId)
          .map((r) => ({
            id: r.id,
            userId: r.userId,
            displayName: r.displayName,
            email: r.email
          }));
        setPeople(assignable);
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoadingPeople(false));
    return () => {
      cancelled = true;
    };
  }, [showAssign, orgId, people]);

  const matches = useMemo<Candidate[]>(() => {
    if (!people) return [];
    const q = query.trim().toLowerCase();
    const captainUserIds = new Set(captains.map((c) => c.userId));
    const available = people.filter((p) => !captainUserIds.has(p.userId));
    if (!q) return available.slice(0, 8);
    return available
      .filter(
        (p) =>
          p.displayName.toLowerCase().includes(q) ||
          (p.email && p.email.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [people, query, captains]);

  async function refresh() {
    try {
      const next = await orgAdminTeams.detail(teamId);
      setCaptains(next.captains);
    } catch (e) {
      console.error(e);
    }
  }

  function resetDialog() {
    setShowAssign(false);
    setMode("pick");
    setQuery("");
    setSelected(null);
    setInviteEmail("");
    setInviteName("");
    setError(null);
  }

  async function handleAssign() {
    if (!selected) {
      setError("Pick a person from the list first.");
      return;
    }
    setError(null);
    setBusy("assign");
    try {
      await orgAdminTeams.assignCaptain(teamId, { userId: selected.userId });
      setFlash(`${selected.displayName} is now the captain.`);
      resetDialog();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleInvite() {
    const email = inviteEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setBusy("invite");
    try {
      const res = await orgAdminTeams.inviteCaptain(teamId, {
        email,
        ...(inviteName.trim() ? { displayName: inviteName.trim() } : {})
      });
      setFlash(
        res.created
          ? `Invite sent to ${email} — they're now this team's captain.`
          : `${email} already had an account — assigned as captain.`
      );
      resetDialog();
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
            Captains manage the team roster, dues, lineups, and store.
            Org-admins can grant or revoke this role here without escalating
            to a super-admin.
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

      {flash ? <Alert tone="success">{flash}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {showAssign ? (
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>// Assign captain</Eyebrow>
            <button
              type="button"
              onClick={resetDialog}
              className="text-fg-muted hover:text-fg"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <div className="mb-3 inline-flex rounded-md border border-border bg-bg p-0.5 font-mono text-[10px] uppercase tracking-widest">
            <button
              type="button"
              onClick={() => { setMode("pick"); setError(null); }}
              disabled={busy !== null}
              className={`rounded px-3 py-1 ${mode === "pick" ? "bg-fg text-bg" : "text-fg-muted hover:text-fg"}`}
            >
              Find existing user
            </button>
            <button
              type="button"
              onClick={() => { setMode("invite"); setError(null); setSelected(null); }}
              disabled={busy !== null}
              className={`rounded px-3 py-1 ${mode === "invite" ? "bg-fg text-bg" : "text-fg-muted hover:text-fg"}`}
            >
              Invite by email
            </button>
          </div>
          {mode === "invite" ? (
            <div className="space-y-3">
              <Field
                label="Email"
                hint="They'll receive a sign-up link and land as captain of this team the moment they accept."
              >
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="captain@example.com"
                  disabled={busy === "invite"}
                  autoFocus
                />
              </Field>
              <Field label="Display name (optional)">
                <Input
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Sheriff Smith"
                  disabled={busy === "invite"}
                />
              </Field>
            </div>
          ) : selected ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-fg">
                  {selected.displayName}
                </p>
                <p className="truncate text-[11px] text-fg-muted">
                  {selected.email ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-fg-muted hover:text-fg"
                aria-label="Clear selection"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <Field
              label="Search by name or email"
              hint={
                loadingPeople
                  ? "Loading org members…"
                  : people && people.length === 0
                    ? "No assignable users in this org yet — invite one from the Users page first."
                    : "Type to filter; pick a person to assign them as captain."
              }
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Sheriff Smith"
                disabled={loadingPeople || busy === "assign"}
                autoFocus
              />
              {!loadingPeople && people && matches.length > 0 ? (
                <ul className="mt-2 max-h-56 divide-y divide-border overflow-auto rounded-md border border-border bg-bg">
                  {matches.map((m) => (
                    <li key={m.userId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(m);
                          setQuery("");
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-bg-subtle"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-fg">
                            {m.displayName}
                          </p>
                          <p className="truncate text-[11px] text-fg-muted">
                            {m.email ?? "—"}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!loadingPeople &&
              people &&
              matches.length === 0 &&
              query.trim() ? (
                <p className="mt-2 text-[12px] text-fg-muted">
                  No match for &ldquo;{query}&rdquo; — try a different name
                  or invite this person to the org first.
                </p>
              ) : null}
            </Field>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetDialog}
              disabled={busy !== null}
            >
              Cancel
            </Button>
            {mode === "pick" ? (
              <Button
                size="sm"
                onClick={handleAssign}
                disabled={!selected || busy !== null}
              >
                {busy === "assign" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                ) : null}
                Assign
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || busy !== null}
              >
                {busy === "invite" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                ) : null}
                Invite &amp; assign
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {captains.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 px-5 py-6 text-[13px] text-fg-muted">
          No active captain yet. Assign one above so the team can manage
          their own roster.
        </div>
      ) : (
        <ul className="space-y-2">
          {captains.map((c) => (
            <li
              key={c.assignmentId}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--tint-amber-bg)] text-[var(--tint-amber-fg)]">
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
                  <Loader2
                    className="mr-1 h-3 w-3 animate-spin"
                    strokeWidth={2}
                  />
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
