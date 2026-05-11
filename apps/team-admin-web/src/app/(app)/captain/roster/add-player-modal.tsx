"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, Search, UserPlus } from "lucide-react";
import { Button, Dialog, DialogActions } from "@sportspulse/ui";
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
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  seasonId: string | null;
  divisionId: string | null;
  currentCount: number;
  maxRosterSize: number;
  onCreated: (msg: string) => void;
}) {
  const [tab, setTab] = useState<"search" | "invite">("search");

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
      await captain.roster.add(teamId, {
        seasonId,
        personId: picked.id
      });
      const name = [picked.legalFirstName, picked.legalLastName]
        .filter(Boolean)
        .join(" ");
      onCreated(`Added ${name} to the roster.`);
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
                  <p className="font-mono text-[10px] uppercase text-fg-muted">
                    {p.id.slice(0, 8)}
                  </p>
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
              <p className="font-mono text-[10px] uppercase text-fg-muted">
                {picked.id.slice(0, 8)}
              </p>
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
        </div>
      )}

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
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
  const [splitAmount, setSplitAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const parsed = splitAmount.trim()
        ? Math.round(parseFloat(splitAmount) * 100)
        : undefined;
      await captain.roster.invite(teamId, {
        seasonId,
        email: email.trim().toLowerCase(),
        splitAmountCents: parsed
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

      <label className="grid gap-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
          Their share of dues (optional)
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={splitAmount}
          onChange={(e) => setSplitAmount(e.target.value)}
          placeholder="125.00"
          className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        />
        <span className="font-mono text-[10px] text-fg-muted">
          Leave blank to use the even-split default for this division.
        </span>
      </label>

      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
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
              ? "text-amber-700 dark:text-amber-300"
              : "text-emerald-700 dark:text-emerald-300"
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
