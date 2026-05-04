"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { League } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function CreateDivisionButton({ leagues }: { leagues: League[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={leagues.length === 0}>
        <Plus className="mr-2 h-4 w-4" />
        New division
      </Button>
      <CreateDivisionDialog
        open={open}
        onClose={() => setOpen(false)}
        leagues={leagues}
      />
    </>
  );
}

function CreateDivisionDialog({
  open,
  onClose,
  leagues
}: {
  open: boolean;
  onClose: () => void;
  leagues: League[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    leagueId: leagues[0]?.id ?? "",
    name: "",
    tier: "",
    genderEligibility: "open" as "male" | "female" | "mixed" | "open",
    maxTeams: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await leagueMgmt.createDivision({
        leagueId: form.leagueId,
        name: form.name,
        tier: form.tier || null,
        genderEligibility: form.genderEligibility,
        maxTeams: form.maxTeams ? Number(form.maxTeams) : null
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create division"
      description="Divisions group teams by age, tier, and gender within a league."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="League" htmlFor="leagueId">
          <Select
            id="leagueId"
            required
            value={form.leagueId}
            onChange={(e) => setForm((f) => ({ ...f, leagueId: e.target.value }))}
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="U14 Tier 1"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Tier" htmlFor="tier" hint="A / B / Premier">
            <Input
              id="tier"
              value={form.tier}
              onChange={(e) =>
                setForm((f) => ({ ...f, tier: e.target.value }))
              }
            />
          </Field>
          <Field label="Gender" htmlFor="genderEligibility">
            <Select
              id="genderEligibility"
              value={form.genderEligibility}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  genderEligibility: e.target
                    .value as typeof form.genderEligibility
                }))
              }
            >
              <option value="open">Open</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="mixed">Mixed</option>
            </Select>
          </Field>
          <Field label="Max teams" htmlFor="maxTeams">
            <Input
              id="maxTeams"
              type="number"
              min={2}
              value={form.maxTeams}
              onChange={(e) =>
                setForm((f) => ({ ...f, maxTeams: e.target.value }))
              }
            />
          </Field>
        </div>

        {error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              "Create division"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
