"use client";

import { useMemo, useState, type FormEvent } from "react";
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
import { Badge } from "@/components/ui/badge";
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

function statusTone(s: GameOfficialStatus) {
  if (s === "confirmed") return "success" as const;
  if (s === "tentative") return "warning" as const;
  return "danger" as const;
}

export function GameOfficialsPanel({
  gameId,
  officials,
  persons,
  personMap
}: {
  gameId: string;
  officials: GameOfficial[];
  persons: Person[];
  personMap: [string, string][];
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
        <Button size="sm" variant="outline" onClick={() => setOpen((s) => !s)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {open ? "Close" : "Assign"}
        </Button>
      </header>

      {open ? (
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
          No officials assigned. Use the Assign button above to add referees,
          linesmen, scorekeepers.
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
                  {lookup.get(o.personId) ?? o.personId.slice(0, 8)}
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
              <Badge tone={statusTone(o.status)} mono>
                {o.status}
              </Badge>
              <RevokeOfficialBtn id={o.id} />
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
  const [form, setForm] = useState({
    personId: persons[0]?.id ?? "",
    role: "referee" as GameOfficialRole,
    slot: "",
    status: "confirmed" as GameOfficialStatus,
    notes: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await gameOps.assignOfficial(gameId, {
        personId: form.personId,
        role: form.role,
        slot: form.slot || null,
        status: form.status,
        notes: form.notes || null
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 border-b border-border px-6 py-5 md:grid-cols-[1fr_1fr_120px_140px_auto]"
    >
      <Field label="Person" htmlFor="ao-person">
        <Select
          id="ao-person"
          required
          value={form.personId}
          onChange={(e) => setForm({ ...form, personId: e.target.value })}
        >
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.preferredName ?? `${p.legalFirstName} ${p.legalLastName}`}
            </option>
          ))}
        </Select>
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
      {error ? (
        <p className="md:col-span-5 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function RevokeOfficialBtn({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
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
      className="rounded-md border border-border bg-surface-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-rose-500/50 hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke"}
    </button>
  );
}
