"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, Search, UserPlus } from "lucide-react";
import { Alert, Button, Dialog, DialogActions } from "@sportspulse/ui";
import type { Person } from "@sportspulse/api-client";
import { captain, iam } from "@/lib/api/browser-api";

export function AddPlayerModal({
  open,
  onClose,
  teamId,
  seasonId,
  divisionId,
  currentCount,
  maxRosterSize,
  onCreated,
  initialTab = "search"
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  seasonId: string | null;
  divisionId: string | null;
  currentCount: number;
  maxRosterSize: number;
  onCreated: (msg: string) => void;
  /** "Invite by email" opens straight on the email form (CAP-16). */
  initialTab?: "search" | "invite";
}) {
  const [tab, setTab] = useState<"search" | "invite">(initialTab);
  // Each open starts on the tab the captain asked for.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  return (
    <Dialog
      open={open && !!seasonId}
      onClose={onClose}
      title="Add player to roster"
      description={`${currentCount} / ${maxRosterSize} slots used.`}
      size="lg"
    >
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setTab("search")}
          className={`-mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest ${
            tab === "search"
              ? "border-accent text-fg"
              : "border-transparent text-fg-muted"
          }`}
        >
          Search existing users
        </button>
        <button
          onClick={() => setTab("invite")}
          className={`-mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest ${
            tab === "invite"
              ? "border-accent text-fg"
              : "border-transparent text-fg-muted"
          }`}
        >
          Invite by email
        </button>
      </div>

      <div className="pt-3">
        {tab === "search" ? (
          <SearchPanel
            teamId={teamId}
            seasonId={seasonId!}
            divisionId={divisionId}
            onClose={onClose}
            onCreated={onCreated}
          />
        ) : (
          <InvitePanel
            teamId={teamId}
            seasonId={seasonId!}
            onClose={onClose}
            onCreated={onCreated}
          />
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// Left panel — search existing users + precheck warnings + add
// ---------------------------------------------------------------------
type Precheck = Awaited<ReturnType<typeof captain.roster.add>> extends never
  ? never
  : Awaited<ReturnType<typeof iam.listPersons>>; // silence type tools

function SearchPanel({
  teamId,
  seasonId,
  divisionId,
  onClose,
  onCreated
}: {
  teamId: string;
  seasonId: string;
  divisionId: string | null;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Person | null>(null);
  const [precheck, setPrecheck] = useState<
    Awaited<ReturnType<typeof getPrecheck>> | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jersey, setJersey] = useState("");

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const page = await iam.listPersons({ search: q.trim(), limit: 8 });
        setResults(page.items);
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    if (!picked || !divisionId) {
      setPrecheck(null);
      return;
    }
    getPrecheck({
      personId: picked.id,
      divisionId,
      teamId
    })
      .then(setPrecheck)
      .catch(() => setPrecheck(null));
  }, [picked, divisionId, teamId]);

  async function confirmAdd() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      // A player joins through the season's registration: registered players
      // join now, others get an invite to register onto the team (UC-04).
      const res = await captain.roster.add(teamId, {
        seasonId,
        personId: picked.id,
        ...(jersey.trim() !== "" ? { jerseyNumber: Number(jersey) } : {})
      });
      onCreated(res.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="grid gap-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Type a name or email
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-fg-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. jane smith"
            className="w-full rounded-md border border-border bg-surface-1 py-2 pl-8 pr-3 text-sm text-fg focus:border-accent focus:outline-none"
            autoFocus
          />
        </div>
      </label>

      {searching && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          searching…
        </p>
      )}

      {results.length > 0 && !picked && (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface-1">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPicked(p)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-bg-subtle"
              >
                <div>
                  <p className="text-sm font-medium text-fg">
                    {p.legalFirstName} {p.legalLastName}
                  </p>
                  {p.preferredName ? (
                    <p className="text-[11px] text-fg-muted">Goes by {p.preferredName}</p>
                  ) : null}
                </div>
                <Mail className="h-3.5 w-3.5 text-fg-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {picked && (
        <div className="rounded-md border border-border bg-surface-1 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-fg">
                {picked.legalFirstName} {picked.legalLastName}
              </p>
              {picked.preferredName ? (
                <p className="text-[11px] text-fg-muted">Goes by {picked.preferredName}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPicked(null);
                setPrecheck(null);
              }}
            >
              Change
            </Button>
          </div>

          {precheck && (
            <PrecheckWarnings precheck={precheck} />
          )}
          <JerseyField value={jersey} onChange={setJersey} />
          <p className="mt-2 text-[12px] text-fg-muted">
            Players join by registering for the season. A player who has not registered gets an
            invite to register onto your team and joins when the league approves it.
          </p>
        </div>
      )}

      {error && (
        <Alert tone="error">
          {error}
        </Alert>
      )}

      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={confirmAdd} disabled={!picked || busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <UserPlus className="mr-2 h-4 w-4" /> Add to roster
            </>
          )}
        </Button>
      </DialogActions>
    </div>
  );
}

// ---------------------------------------------------------------------
// Right panel — invite by email (creates team_invites + sub-invoice)
// ---------------------------------------------------------------------
function InvitePanel({
  teamId,
  seasonId,
  onClose,
  onCreated
}: {
  teamId: string;
  seasonId: string;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [jersey, setJersey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await captain.roster.invite(teamId, {
        seasonId,
        email: email.trim().toLowerCase(),
        ...(jersey.trim() !== "" ? { jerseyNumber: Number(jersey) } : {})
      });
      onCreated(`Invite sent to ${email.trim()}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="grid gap-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="player@example.com"
          className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
          autoFocus
        />
      </label>

      <JerseyField value={jersey} onChange={setJersey} />

      {/* The invite never billed anyone: the share typed here was dropped
          (CAP-16). Shares live on the Dues page, which re-splits the team's
          invoice when players join. */}
      <p className="text-[12px] text-fg-muted">
        Set this player&apos;s share of the team dues on the Dues page once they join.
      </p>

      {error && (
        <Alert tone="error">
          {error}
        </Alert>
      )}

      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={send} disabled={!email.includes("@") || busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" /> Send invite
            </>
          )}
        </Button>
      </DialogActions>
    </div>
  );
}

function PrecheckWarnings({
  precheck
}: {
  precheck: Awaited<ReturnType<typeof getPrecheck>>;
}) {
  const items: Array<{ tone: "ok" | "warn"; text: string }> = [];
  if (precheck.rosterSizeCheck.wouldExceed) {
    items.push({
      tone: "warn",
      text: `Adding this player would exceed the roster cap (${precheck.rosterSizeCheck.currentCount + 1}/${precheck.rosterSizeCheck.maxAllowed}).`
    });
  } else {
    items.push({
      tone: "ok",
      text: `Roster size OK (${precheck.rosterSizeCheck.currentCount}/${precheck.rosterSizeCheck.maxAllowed}).`
    });
  }
  if (precheck.ageCheck.status === "out_of_range") {
    items.push({
      tone: "warn",
      text: `Age ${precheck.ageCheck.ageYears} is outside this division's range.`
    });
  }
  if (precheck.genderCheck.status === "warning") {
    items.push({
      tone: "warn",
      text: `Division gender-eligibility (${precheck.genderCheck.divisionEligibility}) doesn't match this player's identity.`
    });
  }
  if (precheck.playoffWarning.message) {
    items.push({ tone: "warn", text: precheck.playoffWarning.message });
  }
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 rounded-md bg-bg-subtle px-3 py-2 text-[12px]">
      {items.map((i, idx) => (
        <li
          key={idx}
          className={
            i.tone === "warn"
              ? "text-[var(--tint-amber-fg)]"
              : "text-[var(--tint-emerald-fg)]"
          }
        >
          {i.tone === "warn" ? "⚠ " : "✓ "}
          {i.text}
        </li>
      ))}
    </ul>
  );
}

// helper used both for the effect and the warnings type
async function getPrecheck(q: {
  personId: string;
  divisionId: string;
  teamId: string;
}) {
  return await import("@/lib/api/browser-api").then((m) =>
    m.compliance.precheck(q)
  );
}

/** Optional sweater number the player gets when they join (FR-3.11.2). */
function JerseyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = Number(value);
  const bad = value.trim() !== "" && !(Number.isInteger(n) && n >= 0 && n <= 99);
  return (
    <label className="mt-3 grid gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
        Jersey number (optional)
      </span>
      <input
        type="number"
        min={0}
        max={99}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
      />
      {bad ? <span className="text-[11px] text-[var(--tint-rose-fg)]">Use a whole number from 0 to 99.</span> : null}
    </label>
  );
}
