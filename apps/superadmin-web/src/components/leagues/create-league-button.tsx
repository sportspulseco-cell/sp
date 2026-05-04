"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { leagueMgmt } from "@/lib/api/browser-api";
import type { Season } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const FORMATS = [
  { value: "regular", label: "Regular season" },
  { value: "tournament", label: "Tournament" },
  { value: "pickup", label: "Pickup / drop-in" },
  { value: "friendly", label: "Friendly" }
];

export function CreateLeagueButton({ seasons }: { seasons: Season[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={seasons.length === 0}>
        <Plus className="mr-2 h-4 w-4" />
        New league
      </Button>
      <CreateLeagueDialog
        open={open}
        onClose={() => setOpen(false)}
        seasons={seasons}
      />
    </>
  );
}

function CreateLeagueDialog({
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
    sportCode: seasons[0]?.sportCode ?? "HOCKEY_ICE",
    name: "",
    format: "regular" as "regular" | "tournament" | "pickup" | "friendly"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await leagueMgmt.createLeague(form);
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
      title="Create league"
      description="A league lives under a season and groups divisions/teams."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Season" htmlFor="seasonId">
          <Select
            id="seasonId"
            required
            value={form.seasonId}
            onChange={(e) => {
              const s = seasons.find((x) => x.id === e.target.value)!;
              setForm((f) => ({
                ...f,
                seasonId: s.id,
                sportCode: s.sportCode
              }));
            }}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.sportCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="PPHL Adult League"
          />
        </Field>
        <Field label="Format" htmlFor="format">
          <Select
            id="format"
            value={form.format}
            onChange={(e) => set("format", e.target.value as typeof form.format)}
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>

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
              "Create league"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
