"use client";

import { Alert, Badge } from "@sportspulse/ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Flag } from "lucide-react";
import { gameOps } from "@/lib/api/browser-api";
import type {
  GameOfficial,
  GameOfficialRole,
  GameOfficialStatus,
  Person
} from "@/lib/api/types";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile, type Tint } from "@/components/ui/icon-tile";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const ROLES: GameOfficialRole[] = [
  "referee",
  "linesman",
  "scorekeeper",
  "timekeeper",
  "video_review",
  "commissioner",
  "other"
];

function tintForRole(role: GameOfficialRole): Tint {
  switch (role) {
    case "referee":
      return "rose";
    case "linesman":
      return "amber";
    case "scorekeeper":
      return "blue";
    case "timekeeper":
      return "cyan";
    case "video_review":
      return "violet";
    case "commissioner":
      return "emerald";
    default:
      return "neutral";
  }
}

export function GameOfficialsPanel({
  gameId,
  officials,
  persons,
  personMap,
  canEdit = true
}: {
  gameId: string;
  officials: GameOfficial[];
  persons: Person[];
  personMap: [string, string][];
  /** False hides Assign and Revoke (viewer lacks game.assign_officials). */
  canEdit?: boolean;
}) {
  const router = useRouter();
  const lookup = useMemo(() => new Map(personMap), [personMap]);

  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-surface-1">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-start gap-3">
          <IconTile icon={Flag} tint="rose" size="sm" />
          <div>
            <Eyebrow>Officials</Eyebrow>
            <p className="mt-0.5 text-base font-semibold tracking-tight text-fg">
              Crew assigned to this game
            </p>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              {officials.length} active{" "}
              {officials.length === 1 ? "assignment" : "assignments"}
            </p>
          </div>
        </div>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setOpen((s) => !s)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {open ? "Close" : "Assign"}
          </Button>
        ) : null}
      </header>

      {open && canEdit ? (
        <AssignForm
          gameId={gameId}
          persons={persons}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {officials.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-fg-muted">
          {canEdit
            ? "No officials assigned. Use the Assign button above to add referees, linesmen, scorekeepers."
            : "No officials assigned yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {officials.map((o) => (
            <li
              key={o.id}
              className="flex items-center gap-4 px-6 py-3.5"
            >
              <IconTile icon={Flag} tint={tintForRole(o.role)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">
                  {o.personName ?? lookup.get(o.personId) ?? "Unknown official"}
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                    {o.role}
                    {o.slot ? ` · ${o.slot}` : ""}
                  </span>
                </p>
                {o.notes ? (
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    {o.notes}
                  </p>
                ) : null}
              </div>
              <Badge status={o.status} />
              {canEdit ? <RevokeOfficialBtn id={o.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AssignForm({
  gameId,
  persons,
  onDone
}: {
  gameId: string;
  persons: Person[];
  onDone: () => void;
}) {
  // Never preselect someone (FR-3.9): the list starts with the people
  // who hold a referee or scorekeeper role for this game's league.
  const [candidates, setCandidates] = useState<Array<{ personId: string; name: string; roles: string[]; busyWith: string | null }> | null>(null);
  const [everyone, setEveryone] = useState(false);
  const [clash, setClash] = useState<string | null>(null);
  useEffect(() => {
    gameOps.officialCandidates(gameId).then(setCandidates).catch(() => setCandidates([]));
  }, [gameId]);
  const [form, setForm] = useState({
    personId: "",
    role: "referee" as GameOfficialRole,
    slot: "",
    status: "confirmed" as GameOfficialStatus,
    notes: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(force: boolean) {
    setLoading(true);
    setError(null);
    try {
      await gameOps.assignOfficial(gameId, {
        personId: form.personId,
        role: form.role,
        slot: form.slot || null,
        status: form.status,
        notes: form.notes || null,
        ...(force ? { force: true } : {})
      });
      setClash(null);
      onDone();
    } catch (err) {
      const msg = (err as Error).message;
      if (/already on the crew/.test(msg)) setClash(msg);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 border-b border-border px-6 py-5 md:grid-cols-[1fr_1fr_120px_140px_auto]"
    >
      <Field
        label="Person"
        htmlFor="ao-person"
        hint={
          everyone
            ? "Everyone you can see"
            : candidates && candidates.length === 0
              ? "No referee or scorekeeper role in this league yet"
              : "Referees and scorekeepers of this league"
        }
      >
        <Select
          id="ao-person"
          required
          value={form.personId}
          onChange={(e) => {
            const personId = e.target.value;
            const c = candidates?.find((x) => x.personId === personId);
            const role = c?.roles.includes("referee") ? "referee" : c?.roles.includes("scorekeeper") ? "scorekeeper" : form.role;
            setForm({ ...form, personId, role: role as GameOfficialRole });
            setClash(null);
          }}
        >
          <option value="" disabled>
            {candidates === null && !everyone ? "Loading officials…" : "Pick an official"}
          </option>
          {everyone
            ? persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`}
                </option>
              ))
            : (candidates ?? []).map((c) => (
                <option key={c.personId} value={c.personId}>
                  {c.name} · {c.roles.join(", ")}
                  {c.busyWith ? ` (busy: ${c.busyWith})` : ""}
                </option>
              ))}
        </Select>
        <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-fg-muted">
          <input
            type="checkbox"
            checked={everyone}
            onChange={(e) => {
              setEveryone(e.target.checked);
              setForm({ ...form, personId: "" });
            }}
          />
          Show everyone
        </label>
      </Field>
      <Field label="Role" htmlFor="ao-role">
        <Select
          id="ao-role"
          value={form.role}
          onChange={(e) =>
            setForm({ ...form, role: e.target.value as GameOfficialRole })
          }
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Slot" htmlFor="ao-slot">
        <Input
          id="ao-slot"
          value={form.slot}
          onChange={(e) => setForm({ ...form, slot: e.target.value })}
          placeholder="head"
        />
      </Field>
      <Field label="Status" htmlFor="ao-status">
        <Select
          id="ao-status"
          value={form.status}
          onChange={(e) =>
            setForm({
              ...form,
              status: e.target.value as GameOfficialStatus
            })
          }
        >
          <option value="confirmed">Confirmed</option>
          <option value="tentative">Tentative</option>
          <option value="declined">Declined</option>
        </Select>
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" disabled={loading} size="sm">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Assigning…
            </>
          ) : (
            "Assign"
          )}
        </Button>
      </div>
      {clash ? (
        <Alert tone="warning" className="md:col-span-5 flex flex-wrap items-center gap-3">
          <span>{clash}</span>
          <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void submit(true)}>
            Assign anyway
          </Button>
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" className="md:col-span-5">
          {error}
        </Alert>
      ) : null}
    </form>
  );
}

function RevokeOfficialBtn({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      type="button"
      disabled={loading}
      onClick={async () => {
        if (!confirm("Revoke this assignment?")) return;
        setLoading(true);
        try {
          await gameOps.revokeOfficial(id);
          router.refresh();
        } catch (err) {
          alert((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
      variant="outline"
      size="sm"
      className="gap-1.5 hover:border-[var(--tint-rose-fg)]/50 hover:text-[var(--tint-rose-fg)]"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke"}
    </Button>
  );
}
