"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { Region, Season } from "@/lib/api/types";
import { Button, Dialog, DialogActions, Field, Input, Select } from "@sportspulse/ui";

export function CreateDivisionButton({ seasons }: { seasons: Season[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={seasons.length === 0}>
        <Plus className="mr-2 h-4 w-4" />
        New division
      </Button>
      <CreateDivisionDialog
        open={open}
        onClose={() => setOpen(false)}
        seasons={seasons}
      />
    </>
  );
}

function CreateDivisionDialog({
  open,
  onClose,
  seasons
}: {
  open: boolean;
  onClose: () => void;
  seasons: Season[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    seasonId: seasons[0]?.id ?? "",
    name: "",
    tier: "",
    regionId: "",
    genderEligibility: "open" as "male" | "female" | "mixed" | "open",
    maxTeams: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Regions belong to the season's org (Season -> Region -> Division).
  const [regions, setRegions] = useState<Region[]>([]);
  const orgId = seasons.find((s) => s.id === form.seasonId)?.orgId ?? null;
  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;
    leagueMgmt
      .listRegions({ orgId })
      .then((r) => {
        if (!cancelled) setRegions(r.items);
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await leagueMgmt.createDivision({
        seasonId: form.seasonId,
        name: form.name,
        tier: form.tier || null,
        regionId: form.regionId || null,
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
        <Field label="Season" htmlFor="seasonId">
          <Select
            id="seasonId"
            required
            value={form.seasonId}
            onChange={(e) =>
              // Regions differ per org, so a season change resets the region.
              setForm((f) => ({ ...f, seasonId: e.target.value, regionId: "" }))
            }
          >
            {seasons.map((l) => (
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
        <Field
          label="Region"
          htmlFor="regionId"
          hint={
            regions.length === 0
              ? "This organisation has no regions yet. Add them in Org setup."
              : "Optional tier between the season and its divisions."
          }
        >
          <Select
            id="regionId"
            value={form.regionId}
            onChange={(e) => setForm((f) => ({ ...f, regionId: e.target.value }))}
            disabled={regions.length === 0}
          >
            <option value="">No region</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
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
