"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { roster } from "@/lib/api/browser-api";
import type { Person, Season, Team } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function AddMembershipButton({
  teams,
  persons,
  seasons
}: {
  teams: Team[];
  persons: Person[];
  seasons: Season[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    teamId: teams[0]?.id ?? "",
    personId: persons[0]?.id ?? "",
    seasonId: seasons[0]?.id ?? "",
    jerseyNumber: "",
    positionCode: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled =
    teams.length === 0 || persons.length === 0 || seasons.length === 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await roster.add({
        teamId: form.teamId,
        personId: form.personId,
        seasonId: form.seasonId,
        jerseyNumber: form.jerseyNumber
          ? parseInt(form.jerseyNumber, 10)
          : undefined,
        positionCode: form.positionCode || undefined
      });
      setOpen(false);
      setForm({
        ...form,
        jerseyNumber: "",
        positionCode: ""
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" />
        Add to roster
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add to roster"
        description="Append a roster move (kind: add). The team_memberships projection updates automatically."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Person" htmlFor="am-person">
            <Select
              id="am-person"
              required
              value={form.personId}
              onChange={(e) => setForm({ ...form, personId: e.target.value })}
            >
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.preferredName ??
                    `${p.legalFirstName} ${p.legalLastName}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Team" htmlFor="am-team">
            <Select
              id="am-team"
              required
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Season" htmlFor="am-season">
            <Select
              id="am-season"
              required
              value={form.seasonId}
              onChange={(e) => setForm({ ...form, seasonId: e.target.value })}
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jersey #" htmlFor="am-jersey">
              <Input
                id="am-jersey"
                type="number"
                min={0}
                max={999}
                value={form.jerseyNumber}
                onChange={(e) =>
                  setForm({ ...form, jerseyNumber: e.target.value })
                }
                placeholder="Optional"
              />
            </Field>
            <Field label="Position" htmlFor="am-position">
              <Input
                id="am-position"
                value={form.positionCode}
                onChange={(e) =>
                  setForm({ ...form, positionCode: e.target.value })
                }
                placeholder="F / D / G / etc."
              />
            </Field>
          </div>

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <DialogActions>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding…
                </>
              ) : (
                "Add to roster"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
